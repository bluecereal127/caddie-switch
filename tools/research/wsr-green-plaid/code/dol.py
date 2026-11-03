import struct,sys
DOL=r'C:/Users/Stephen/Downloads/WSR_Extract/DATA/sys/main.dol'
data=open(DOL,'rb').read()
offs=struct.unpack('>18I',data[0:72]); addrs=struct.unpack('>18I',data[72:144]); sizes=struct.unpack('>18I',data[144:216])
secs=[(o,a,s) for o,a,s in zip(offs,addrs,sizes) if s]
def va2off(va):
    for o,a,s in secs:
        if a<=va<a+s: return o+va-a
def off2va(off):
    for o,a,s in secs:
        if o<=off<o+s: return a+off-o
def rd(va,n):
    o=va2off(va); return data[o:o+n]
def u32(va): return struct.unpack('>I',rd(va,4))[0]
def f32(va): return struct.unpack('>f',rd(va,4))[0]
def cstr(va):
    b=rd(va,200); return b.split(b'\0')[0].decode('latin1')
