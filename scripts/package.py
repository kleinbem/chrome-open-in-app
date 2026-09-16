import zipfile
import os
import json

def package_extension():
    # Read version from manifest
    with open('manifest.json', 'r', encoding='utf-8') as f:
        manifest = json.load(f)
    version = manifest.get('version', '1.0.0')
    output_zip = f'open-in-app-v{version}.zip'

    files_to_pack = ['manifest.json', 'background.js']
    dirs_to_pack = ['popup', 'icons', 'utils']

    if os.path.exists(output_zip):
        os.remove(output_zip)

    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
        for f in files_to_pack:
            if os.path.exists(f):
                zf.write(f)
        for d in dirs_to_pack:
            for root, _, filenames in os.walk(d):
                for fn in sorted(filenames):
                    if not fn.startswith('.') and not fn.endswith('.DS_Store'):
                        fp = os.path.join(root, fn)
                        zf.write(fp)

    size_kb = os.path.getsize(output_zip) / 1024
    print(f'Successfully created {output_zip} ({size_kb:.1f} KB)')
    print('Ready for upload to Chrome Web Store Developer Dashboard!')

if __name__ == '__main__':
    package_extension()
