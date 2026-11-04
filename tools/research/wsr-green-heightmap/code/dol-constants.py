# The constants the Terrain-view fade (0x80401d6c) reads from main.dol's .sdata2, and the material name the M_Green lookups pass.
# Run from anywhere: python dol-constants.py  (uses ../../wsr-green-plaid/code/dol.py, which reads the extracted main.dol)
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../wsr-green-plaid/code"))
from dol import *
r2 = 0x806fe080
print("main.dol (RZTE01 Rev 1) constants read by the Terrain-view fade 0x80401d6c (r2 = 0x806fe080):")
print("  r2-0x698 = 0x%08x step  %r" % (r2 - 0x698, f32(r2 - 0x698)))
print("  r2-0x6e0 = 0x%08x max   %r" % (r2 - 0x6e0, f32(r2 - 0x6e0)))
print("  r2-0x6e8 = 0x%08x min   %r" % (r2 - 0x6e8, f32(r2 - 0x6e8)))
print("  r2-0x694 = 0x%08x K     %r (white)" % (r2 - 0x694, f32(r2 - 0x694)))
print("  r2-0x70c = 0x%08x bytes %s (the Terrain-view k2: R, G, B; alpha written as 0xff)" % (r2 - 0x70c, list(rd(r2 - 0x70c, 3))))
print("  r2-0x690 = 0x%08x %s (the u32 -> double conversion constant)" % (r2 - 0x690, rd(r2 - 0x690, 8).hex()))
print("r13-0x6800 -> 0x%08x -> %r (the material name every M_Green lookup passes)" % (u32(0x806f8120 - 0x6800), cstr(u32(0x806f8120 - 0x6800))))
