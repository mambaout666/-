"""Update an existing crawl report with source media/metrics and render the shared template."""
import argparse
import json
from pathlib import Path
from crawler import Client, save_json
from media import normalize_details
from showcase import render


def main():
    parser=argparse.ArgumentParser(description='为采集 JSON 补齐图片、视频、浏览量和下载入口，生成展示页')
    parser.add_argument('report',type=Path)
    parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parent/'results/gallery')
    parser.add_argument('--config',type=Path,help='自定义标题、配色等 JSON 配置')
    parser.add_argument('--offline',action='store_true',help='使用报告内已有媒体，不请求详情')
    args=parser.parse_args()
    report=json.loads(args.report.read_text(encoding='utf-8'))
    if not isinstance(report.get('results'),list): parser.error('报告缺少 results 数组')
    if not args.offline:
        client=Client()
        for row in report['results']:
            try:
                detail=client.get(f"Mod/{int(row['id'])}/ProfilePage",records=False)
                if detail.get('_idRow')!=row['id'] or detail.get('_aGame',{}).get('_idRow')!=19567: raise ValueError('详情 ID 或游戏不匹配')
                row.update(normalize_details(detail));row.pop('media_error',None)
            except Exception as exc:
                row['media_error']=str(exc)
                print(f"Detail unavailable: {row.get('id')}: {exc}")
    config=json.loads(args.config.read_text(encoding='utf-8')) if args.config else None
    args.output.mkdir(parents=True,exist_ok=True)
    save_json(args.output/'report.json',report)
    (args.output/'index.html').write_text(render(report,config),encoding='utf-8')
    print(args.output/'index.html')


if __name__=='__main__':main()
