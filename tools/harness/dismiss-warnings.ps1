# Dismisses Dolphin's blocking panic dialogs ("Warning" / "Error" with an OK
# button) on one harness instance's Dolphins, those whose command line names
# its user dir (state\user<N>; -Instance 1,2,3 for several), and prints each dialog's text. Instance 17
# stopped at boot behind "IOS_FS: Failed to rename temporary FST file" on
# 2026-10-22. The user's own Dolphin has no harness user dir: never touched.
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/harness/dismiss-warnings.ps1 -Instance 17
# -Instance is one comma list ("1,2,3"): under -File a list arrives as a single string
param([string]$Instance)
Add-Type @'
using System; using System.Text; using System.Runtime.InteropServices; using System.Collections.Generic;
public class DW {
  public delegate bool CB(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr p, CB cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(CB cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  public static List<string> Dismiss(uint pid) {
    var o = new List<string>();
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      var s = new StringBuilder(64); GetWindowText(h, s, 64);
      var title = s.ToString();
      if (p == pid && IsWindowVisible(h) && (title == "Warning" || title == "Error")) {
        var text = ""; IntPtr ok = IntPtr.Zero;
        EnumChildWindows(h, (k, m) => {
          var t = new StringBuilder(2048); GetWindowText(k, t, 2048); var x = t.ToString();
          if (x == "OK" || x == "&OK") ok = k; else if (x.Length > 0) text += x + " ";
          return true; }, IntPtr.Zero);
        if (ok != IntPtr.Zero) { SendMessage(ok, 0x00F5, IntPtr.Zero, IntPtr.Zero); o.Add(title + ": " + text.Trim()); }
      }
      return true; }, IntPtr.Zero);
    return o; } }
'@
$dirs = @($Instance -split "[,\s]+" | Where-Object { $_ } | ForEach-Object { "state\user$_ " })
Get-CimInstance Win32_Process -Filter "name='Dolphin.exe'" | Where-Object { $cl = $_.CommandLine; $cl -and @($dirs | Where-Object { $cl.Contains($_) }).Count } | ForEach-Object {
  foreach ($m in [DW]::Dismiss([uint32]$_.ProcessId)) { "dismissed a Dolphin dialog (pid {0}): {1}" -f $_.ProcessId, $m }
}
