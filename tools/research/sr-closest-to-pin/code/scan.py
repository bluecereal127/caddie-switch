import sys,re
sys.path.insert(0,r"C:/Users/Stephen/Desktop/caddie-switch-web/caddie-web/tools/harness/state/eden/lab/r6work/sr/code")
import srlib as N, capstone
cs=capstone.Cs(capstone.CS_ARCH_ARM64,capstone.CS_MODE_ARM); cs.skipdata=True
lo,hi=0x3100000,0x3300000
ins=list(cs.disasm(N.img[lo:hi],lo))
fn=None
hits=[]
for k,i in enumerate(ins):
    if i.mnemonic=='pacibsp': fn=i.address
    if i.mnemonic=='ldrb' and '#0xa2]' in i.op_str:
        r=i.op_str.split(',')[0]
        for j in ins[k+1:k+10]:
            if j.mnemonic in('tbz','tbnz') and j.op_str.startswith(r+', #4,'):
                hits.append(('tb',i.address,j.address,j.mnemonic,fn));break
            if j.mnemonic in('ubfx','lsr','and') and r in j.op_str.split(',')[1:2].__str__() and '#4' in j.op_str:
                hits.append(('alu',i.address,j.address,j.mnemonic+' '+j.op_str,fn));break
    if i.mnemonic in('and','tst','orr','eor','bic') and '#0x100000' in i.op_str and not '#0x1000000' in i.op_str:
        hits.append(('imm',i.address,i.address,i.mnemonic+' '+i.op_str,fn))
    if i.mnemonic in('tbz','tbnz') and re.match(r'w\d+, #0x14,',i.op_str):
        hits.append(('bit20',i.address,i.address,i.mnemonic+' '+i.op_str,fn))
for h in hits: print(h[0],hex(h[1]),hex(h[2]),h[3],'fn',hex(h[4]) if h[4] else None)
print(len(hits))
