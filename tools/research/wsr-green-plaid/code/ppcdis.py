from dol import *
from capstone import *
import sys
md=Cs(CS_ARCH_PPC,CS_MODE_32|CS_MODE_BIG_ENDIAN|CS_MODE_PS); md.skipdata=True
def dis(lo,hi,out=sys.stdout):
    code=rd(lo,hi-lo)
    for i in md.disasm(code,lo):
        out.write("%08x: %-8s %s\n"%(i.address,i.mnemonic,i.op_str))
if __name__=='__main__':
    dis(int(sys.argv[1],16),int(sys.argv[2],16))
