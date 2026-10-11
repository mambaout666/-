import argparse
import logging
import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import crawler
from games import GAMES, get_game
from media import enrich_state
from showcase import render


class MultiGameTests(unittest.TestCase):
    def state(self, game):
        return dict(version=1, game_id=game['id'], scope='new_week', start=100, end=200,
                    mods=[], counts={}, errors={}, next_index_page=1)

    def test_each_game_filters_index_and_exports_its_identity(self):
        for game in GAMES:
            with self.subTest(game=game['key']), tempfile.TemporaryDirectory() as temp:
                calls = []

                class Client:
                    def get(self, endpoint, **params):
                        calls.append((endpoint, params))
                        return {'_aRecords': [{'_idRow': 42, '_aGame': {'_idRow': game['id']},
                            '_tsDateAdded': 150, '_nLikeCount': 9, '_sName': 'A Mod'}],
                            '_aMetadata': {'_nRecordCount': 1, '_nPerpage': 50}}

                state = self.state(game)
                crawler.fetch_new_week(Client(), state, Path(temp) / 'checkpoint.json')
                self.assertEqual(calls[0][1]['_aFilters[Generic_Game]'], game['id'])
                report, path = crawler.export_report(state, Path(temp) / 'output', 10)
                self.assertEqual(report['game'], game)
                self.assertEqual(report['status'], 'complete')
                html = path.read_text(encoding='utf-8')
                config = json.loads(re.search(r'id="site-config">(.*?)</script>', html, re.S)[1])
                self.assertEqual(config['title'], game['title'])
                self.assertEqual(len(report['results']), 1)

    def test_other_game_rows_cannot_contaminate_a_checkpoint(self):
        for game in GAMES:
            state = self.state(game)
            other = next(g for g in GAMES if g['id'] != game['id'])

            class Client:
                def get(self, endpoint, **params):
                    return {'_aRecords': [{'_idRow': 1, '_aGame': {'_idRow': other['id']},
                        '_tsDateAdded': 150, '_nLikeCount': 5}],
                        '_aMetadata': {'_nRecordCount': 1, '_nPerpage': 50}}

            with tempfile.TemporaryDirectory() as temp, self.assertRaises(crawler.CrawlError):
                crawler.fetch_new_week(Client(), state, Path(temp) / 'checkpoint.json')
            self.assertEqual(state['mods'], [])

    def test_detail_identity_uses_selected_game(self):
        for game in GAMES:
            state = self.state(game)
            state.update(mods=[{'id': 42}], counts={'42': {'weekly_likes': 3}})

            class Client:
                def get(self, endpoint, **params):
                    return {'_idRow': 42, '_aGame': {'_idRow': game['id']}, '_nViewCount': 10}

            enrich_state(Client(), state)
            self.assertEqual(state['details']['42']['view_count'], 10)
            self.assertNotIn('media_error', state['details']['42'])

    def test_legacy_reports_and_custom_titles_still_work(self):
        self.assertEqual(crawler.make_report(dict(start=100, end=200, mods=[], counts={}, errors={}), 10)['game']['key'], 'zzz')
        report = {'game': get_game('hsr'), 'results': []}
        self.assertIn('My custom edition', render(report, {'title': 'My custom edition'}))
        with self.assertRaises(ValueError):
            get_game(999999)

    def test_run_keeps_game_checkpoints_separate_and_legacy_zzz_resumable(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(crawler, 'ROOT', Path(temp)), \
                patch.object(crawler, 'fetch_new_week') as fetch, patch.object(crawler, 'enrich_state'):
            def complete(client, state, checkpoint):
                state.update(index_done=True, site_total=0)
            fetch.side_effect = complete
            for game in GAMES:
                args = argparse.Namespace(game=game['key'], resume=False, max_mods=0, scope='new-week',
                    interval=.4, timeout=25, system_proxy=False, workers=1, top=10)
                self.assertEqual(crawler.run(args), 0)
                checkpoint = Path(temp) / 'data' / ('' if game['key'] == 'zzz' else game['key']) / 'checkpoint.json'
                state = json.loads(checkpoint.read_text(encoding='utf-8'))
                self.assertEqual(state['game_id'], game['id'])
                args.resume = True
                self.assertEqual(crawler.run(args), 0)
                if game['key'] == 'zzz':
                    del state['game_id']
                    checkpoint.write_text(json.dumps(state), encoding='utf-8')
                    self.assertEqual(crawler.run(args), 0)
            self.assertEqual(len(list((Path(temp) / 'results').iterdir())), 4)

    def test_cli_can_start_a_non_default_game_in_a_fresh_checkout(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(crawler, 'ROOT', Path(temp)), \
                patch('sys.argv', ['crawler.py', '--game', 'hsr']), \
                patch.object(crawler.logging, 'FileHandler', return_value=logging.NullHandler()), \
                patch.object(crawler.logging, 'basicConfig'), patch.object(crawler, 'run') as run:
            def check_lock(args):
                self.assertEqual(args.game, 'hsr')
                self.assertTrue((Path(temp) / 'data/hsr/running.lock').exists())
                return 0
            run.side_effect = check_lock
            self.assertEqual(crawler.main(), 0)
            self.assertFalse((Path(temp) / 'data/hsr/running.lock').exists())
