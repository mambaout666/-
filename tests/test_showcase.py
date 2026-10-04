import json
import re
import unittest
from media import normalize_details, video_url
from showcase import render


class ShowcaseTests(unittest.TestCase):
    def test_real_file_urls_only_and_no_archived_files(self):
        data = normalize_details({'_aFiles': [
            {'_sFile':'a.zip','_sDownloadUrl':'https://gamebanana.com/dl/123'},
            {'_sFile':'b.zip','_sDownloadUrl':'javascript:alert(1)'},
            {'_sFile':'c.zip','_sDownloadUrl':'https://gamebanana.com/dl/456','_bIsArchived':True},
            {'_sFile':'d.zip','_sDownloadUrl':'https://evil.invalid/dl/123'}]})
        self.assertEqual(len(data['files']),1)
        self.assertEqual(data['files'][0]['url'],'https://gamebanana.com/dl/123')

    def test_video_normalization_is_source_based(self):
        self.assertEqual(video_url('https://youtu.be/abcdefghijk?t=10'), {'type':'youtube','url':'https://www.youtube-nocookie.com/embed/abcdefghijk'})
        self.assertEqual(video_url('https://player.vimeo.com/video/1234')['type'],'vimeo')
        self.assertIsNone(video_url('https://evil.invalid/watch?v=abcdefghijk'))
        result=normalize_details({'_sText':'<iframe src="https://www.youtube.com/embed/abcdefghijk"></iframe>'})
        self.assertEqual(len(result['videos']),1)
        self.assertEqual(normalize_details({})['videos'],[])

    def test_unknown_metrics_remain_unknown_and_sensitive_media_flagged(self):
        result=normalize_details({'_sInitialVisibility':'hide'})
        self.assertIsNone(result['view_count'])
        self.assertTrue(result['sensitive'])

    def test_source_visibility_is_preserved_separately_from_rating(self):
        result=normalize_details({'_sInitialVisibility':'show','_aContentRatings':{'pn':'Partial Nudity'}})
        self.assertTrue(result['sensitive'])
        self.assertEqual(result['source_visibility'],'show')
        self.assertEqual(result['media_schema'],2)

    def test_script_terminators_and_template_tokens_cannot_escape_json(self):
        report={'status':'partial','results':[{'name':'</script><img onerror="alert(1)"> __CONFIG_JSON__'}]}
        output=render(report,{'title':'</script>new title'})
        body=re.search(r'id="report-data">(.*?)</script>',output,re.S).group(1)
        self.assertEqual(json.loads(body),report)
        self.assertNotIn('</script><img',output)
        self.assertEqual(output.count('</script>'),3)


if __name__=='__main__': unittest.main()
