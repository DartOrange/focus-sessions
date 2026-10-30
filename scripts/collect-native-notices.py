"""Collect upstream runtime license texts. Run from the repository root."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen

SOURCES = {
    'AndroidX / Apache 2.0': 'https://raw.githubusercontent.com/androidx/androidx/androidx-main/LICENSE.txt',
    'Kotlin': 'https://raw.githubusercontent.com/JetBrains/kotlin/v2.2.10/license/LICENSE.txt',
    'Hermes': 'https://raw.githubusercontent.com/facebook/hermes/main/LICENSE',
    'Hermes ICU notices': 'https://raw.githubusercontent.com/facebook/hermes/main/doc/icu_license.txt',
    'Hermes LLVM notices': 'https://raw.githubusercontent.com/facebook/hermes/main/external/llvh/LICENSE.txt',
    'Hermes regex notices': 'https://raw.githubusercontent.com/facebook/hermes/main/include/hermes/Regex/LICENSE.TXT',
    'Hermes zip notices': 'https://raw.githubusercontent.com/facebook/hermes/main/external/zip/UNLICENSE',
    'fbjni': 'https://raw.githubusercontent.com/facebookincubator/fbjni/v0.7.0/LICENSE',
    'Fresco': 'https://raw.githubusercontent.com/facebook/fresco/v3.7.0/LICENSE',
    'SoLoader': 'https://raw.githubusercontent.com/facebook/SoLoader/v0.12.1/LICENSE',
    'OkHttp': 'https://raw.githubusercontent.com/square/okhttp/parent-4.9.2/LICENSE.txt',
    'Okio': 'https://raw.githubusercontent.com/square/okio/parent-2.9.0/LICENSE.txt',
    'Folly': 'https://raw.githubusercontent.com/facebook/folly/v2024.11.18.00/LICENSE',
    'Boost': 'https://raw.githubusercontent.com/boostorg/boost/boost-1.83.0/LICENSE_1_0.txt',
    'double-conversion': 'https://raw.githubusercontent.com/google/double-conversion/v1.1.6/LICENSE',
    'fast_float': 'https://raw.githubusercontent.com/fastfloat/fast_float/v8.0.0/LICENSE-MIT',
    'fmt': 'https://raw.githubusercontent.com/fmtlib/fmt/12.1.0/LICENSE',
    'glog': 'https://raw.githubusercontent.com/google/glog/v0.3.5/COPYING',
    'gflags': 'https://raw.githubusercontent.com/gflags/gflags/v2.2.0/COPYING.txt',
    'nlohmann/json': 'https://raw.githubusercontent.com/nlohmann/json/v3.11.2/LICENSE.MIT',
    'Yoga': 'https://raw.githubusercontent.com/facebook/yoga/main/LICENSE',
}

def fetch(item):
    name, url = item
    with urlopen(url, timeout=30) as response:
        body = response.read().decode('utf-8')
    return f"\n{'=' * 72}\n{name}\n{url}\n{'=' * 72}\n{body}\n"

with ThreadPoolExecutor(max_workers=6) as pool:
    notices = list(pool.map(fetch, SOURCES.items()))
Path('demo/NATIVE_LICENSES.txt').write_text('Native runtime license notices. See THIRD_PARTY_NOTICES.md.\n' + ''.join(notices), encoding='utf-8')
print(f'Collected {len(notices)} upstream runtime notices.')
