import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../wsr-green-plaid/code"))
from dol import *
import re, struct
print([(hex(a), hex(s)) for o, a, s in secs])
pat = re.compile(rb'[\x20-\x7e]*(?:Fairway|fairway|Kiwa|M_Rough|M_Green|_line|Line1|M_Color|Jimen)[\x20-\x7e]*\x00')
found = {}
for m in pat.finditer(data):
    s = m.group(0)[:-1]
    # back up to string start
    st = m.start()
    va = off2va(st)
    found[va] = s.decode('latin1')
    print(hex(va), s.decode('latin1'))
# the pointer table at 0x806f1920
print('table 0x806f1920:')
for k in range(-4, 12):
    v = u32(0x806f1920 + 4 * k)
    try: print(k, hex(v), cstr(v))
    except Exception: print(k, hex(v))
# every 4-byte word in data sections pointing to one of the strings
print('pointers to the strings:')
for o, a, s in secs[2:]:
    for i in range(0, s - 3, 4):
        w = struct.unpack('>I', data[o + i:o + i + 4])[0]
        if w in found: print('  ', hex(a + i), '->', hex(w), found[w])
