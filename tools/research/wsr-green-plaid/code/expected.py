"""Expected WSR green checker texture matrix (slot 0 of M_Green) from the ball (B) and the cup (A), game world coords.
usage: python expected.py Ax Ay Az Bx By Bz   -> prints the 3x4 effect matrix and (s,t) of a probe point
"""
import sys, math
X=18.288
def matrix(A,B):
    dx,dz=A[0]-B[0],A[2]-B[2]
    n=math.hypot(dx,dz); vx,vz=dx/n,dz/n
    V=[[-vz,0,vx,0],[vx,0,vz,0],[0,1,0,0]]
    for r in V[:2]: r[3]=-(r[0]*A[0]+r[1]*A[1]+r[2]*A[2])
    V[2][3]=-A[1]
    O=[[-1/X,0,0,.75],[0,1/X,0,.75],[0,0,0,1]]
    # O (3x4 -> 4x4 with last row 0001) x V
    M=[[sum(O[i][k]*(V[k][j] if k<3 else (1 if j==3 else 0)) for k in range(4)) if True else 0 for j in range(4)] for i in range(3)]
    # k=3 term: O[i][3]*(row3 of V = 0,0,0,1)
    return M,(vx,vz)
if __name__=='__main__':
    a=list(map(float,sys.argv[1:7]))
    M,v=matrix(a[:3],a[3:])
    print('v=',v)
    for r in M: print([round(x,6) for x in r])
