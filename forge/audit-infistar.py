"""One-time live image capability audit. Prompts for a key; never persists it."""
import argparse
import base64
import concurrent.futures
import getpass
import io
import json
import pathlib
import re
import time
import urllib.error
import urllib.request

from PIL import Image

ROOT = 'https://infistar.cc'
REPORT = pathlib.Path(__file__).with_name('infistar_matrix_results.json')
SIZES = {
    '1K': {'16:9': '1280x720', '3:2': '1152x768', '4:3': '1024x768', '1:1': '1024x1024'},
    '2K': {'16:9': '2048x1152', '3:2': '2304x1536', '4:3': '2048x1536', '1:1': '2048x2048'},
    '4K': {'16:9': '3840x2160', '3:2': '3456x2304', '4:3': '3200x2400', '1:1': '2816x2816'},
}
RATIOS = {'16:9': 16 / 9, '3:2': 3 / 2, '4:3': 4 / 3, '1:1': 1}
IMAGE_RE = re.compile(r'image|seedream|flux|kolors|dall-e|gpt-image|cogview|sd-|stable-diffusion|imagen|hy-image|wanx|qwen-image', re.I)


def request_size(model, resolution, ratio):
    if model.startswith('gpt-image-2.5-') and resolution == '1K':
        return {'4:3': '1280x960', '1:1': '1152x1152'}.get(ratio, SIZES[resolution][ratio])
    if model.startswith('doubao-seedream-5-0-') and resolution == '2K':
        return {'16:9': '2848x1600', '3:2': '2496x1664',
                '4:3': '2304x1728', '1:1': '2048x2048'}[ratio]
    if model.startswith('doubao-seedream-4-0-') and resolution == '1K':
        return {'16:9': '1280x720', '3:2': '1248x832',
                '4:3': '1152x864', '1:1': '1024x1024'}[ratio]
    return SIZES[resolution][ratio]


def request_json(url, key, body=None, timeout=240):
    headers = {'Authorization': 'Bearer ' + key, 'Accept': 'application/json'}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    request = urllib.request.Request(url, headers=headers,
                                     data=None if body is None else json.dumps(body).encode())
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def dimensions(item):
    if item.get('b64_json'):
        data = base64.b64decode(item['b64_json'])
    elif 'url' in item:
        with urllib.request.urlopen(item['url'], timeout=90) as response:
            data = response.read()
    else:
        raise ValueError('No image payload')
    with Image.open(io.BytesIO(data)) as image:
        return image.size


def run_one(key, model, ratio, resolution):
    start = time.monotonic()
    size = request_size(model, resolution, ratio)
    native = model.startswith('gemini-')
    chat = model == 'gemini-3.1-flash-lite-image'
    if chat:
        url = ROOT + '/v1/chat/completions'
        body = {'model': model, 'messages': [{'role': 'user', 'content': 'Draw a simple blue circle on a white background.'}],
                'stream': False, 'generation_config': {'responseModalities': ['IMAGE'],
                'imageConfig': {'aspectRatio': ratio, 'imageSize': resolution}}}
    elif native:
        url = f'{ROOT}/v1beta/models/{model}:generateContent'
        body = {'contents': [{'role': 'user', 'parts': [{'text': 'Draw a simple blue circle on a white background.'}]}],
                'generationConfig': {'responseModalities': ['TEXT', 'IMAGE'],
                                     'imageConfig': {'aspectRatio': ratio, 'imageSize': resolution}}}
    else:
        url = ROOT + '/v1/images/generations'
        body = {'model': model, 'prompt': 'Draw a simple blue circle on a white background.',
                'size': size}
    result = {'model': model, 'ratio': ratio, 'resolution': resolution,
              'requested': size if not native else f'{ratio} {resolution}'}
    try:
        payload = request_json(url, key, body)
        if chat:
            content = payload.get('choices', [{}])[0].get('message', {}).get('content') or ''
            match = re.search(r'data:(image/[\w.+-]+);base64,([A-Za-z0-9+/=]+)', content)
            item = {'b64_json': match.group(2)} if match else None
        elif native:
            parts = [part for candidate in payload.get('candidates', [])
                     for part in candidate.get('content', {}).get('parts', [])]
            item = next(({'b64_json': part.get('inlineData', part.get('inline_data'))['data']}
                         for part in parts if not part.get('thought') and
                         part.get('inlineData', part.get('inline_data'))), None)
        else:
            item = (payload.get('data') or payload.get('images') or [None])[0]
        if not item:
            raise ValueError('No image in response: ' + json.dumps(payload, ensure_ascii=False)[:400])
        width, height = dimensions(item)
        expected_width, expected_height = map(int, size.split('x'))
        ratio_ok = abs(width / height / RATIOS[ratio] - 1) <= .012
        if native:
            resolution_ok = max(width, height) >= {'1K': 1024, '2K': 2000, '4K': 4000}[resolution]
        else:
            resolution_ok = width >= expected_width and height >= expected_height
        result.update(width=width, height=height, ratio_ok=ratio_ok,
                      resolution_ok=resolution_ok, ok=ratio_ok and resolution_ok)
    except urllib.error.HTTPError as error:
        result.update(ok=False, http=error.code,
                      error=error.read(800).decode('utf-8', 'replace'))
    except Exception as error:
        result.update(ok=False, error=f'{type(error).__name__}: {str(error)[:500]}')
    result['seconds'] = round(time.monotonic() - start, 1)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--full', action='store_true')
    parser.add_argument('--workers', type=int, default=3)
    parser.add_argument('--model')
    parser.add_argument('--retry-failed', action='store_true')
    args = parser.parse_args()
    key = getpass.getpass('Infistar key: ')
    models = request_json(ROOT + '/v1/models', key)['data']
    images = [m['id'] for m in models if IMAGE_RE.search(m['id'])]
    print('Image models:', len(images), ', '.join(images), flush=True)
    prior = json.loads(REPORT.read_text('utf-8')) if REPORT.exists() else []
    entries = {(r['model'], r['ratio'], r['resolution']): r for r in prior
               if not r.get('error', '').startswith('UnidentifiedImageError')}
    pilot = [(model, '1:1', '1K') for model in images]
    full = [(model, ratio, resolution) for model in images
            for resolution in SIZES for ratio in RATIOS]
    targets = full if args.full else pilot
    if args.model:
        targets = [item for item in targets if item[0] == args.model]
    pending = [item for item in targets if item not in entries or args.retry_failed and not entries[item]['ok']]
    print(f'Completed: {len(entries)}, pending: {len(pending)}', flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(run_one, key, *item): item for item in pending}
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            entry_key = (result['model'], result['ratio'], result['resolution'])
            entries[entry_key] = result
            REPORT.write_text(json.dumps(list(entries.values()), ensure_ascii=False, indent=2), 'utf-8')
            outcome = 'PASS' if result['ok'] else 'FAIL'
            detail = f"{result.get('width')}x{result.get('height')}" if 'width' in result else f"HTTP {result.get('http', '-')} {result.get('error', '')[:120]}"
            print(f'{len(entries)}/{len(targets)} {outcome} {result["model"]} {result["ratio"]} {result["resolution"]}: {detail} ({result["seconds"]}s)', flush=True)


if __name__ == '__main__':
    main()
