using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

namespace BrowserNametag
{
    public class MainForm : Form
    {
        // Win32 API Declarations
        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern int GetWindowTextLength(IntPtr hWnd);

        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool SetWindowText(IntPtr hWnd, string lpString);

        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

        [DllImport("user32.dll")]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        // UI Controls
        private TextBox txtCustomTitle;
        private Button btnToggle;
        private RadioButton rbReplace;
        private RadioButton rbRemoveSuffix;
        private RadioButton rbPrefix;
        private Label lblStatus;
        private NotifyIcon trayIcon;
        private ContextMenuStrip trayMenu;
        private Timer updateTimer;
        private CheckBox chkAutoStart;

        // Settings file
        private static readonly string ConfigPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "BrowserNametag",
            "config.ini"
        );

        private bool isRunning = false;
        private readonly Dictionary<IntPtr, string> originalTitles = new Dictionary<IntPtr, string>();

        private readonly string[] knownBrowserProcesses = new string[]
        {
            "thorium", "chrome", "msedge", "brave", "firefox", "opera", "vivaldi", "yandex"
        };

        public MainForm()
        {
            InitializeComponent();
            LoadSettings();
            SetupTray();

            updateTimer = new Timer();
            updateTimer.Interval = 250; // 4 times per second
            updateTimer.Tick += UpdateTimer_Tick;

            if (isRunning)
            {
                updateTimer.Start();
            }
        }

        private void InitializeComponent()
        {
            this.Text = "Browser Nametag";
            this.Size = new Size(380, 420);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(15, 23, 42); // #0f172a
            this.ForeColor = Color.FromArgb(248, 250, 252);
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

            // Header Panel
            Panel pnlHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 60,
                BackColor = Color.FromArgb(30, 41, 59)
            };

            Label lblTitle = new Label
            {
                Text = "Browser Nametag",
                Font = new Font("Segoe UI", 13f, FontStyle.Bold),
                ForeColor = Color.White,
                Location = new Point(16, 12),
                AutoSize = true
            };

            lblStatus = new Label
            {
                Text = "[ Выключено ]",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(239, 68, 68),
                Location = new Point(230, 16),
                AutoSize = true
            };

            pnlHeader.Controls.Add(lblTitle);
            pnlHeader.Controls.Add(lblStatus);
            this.Controls.Add(pnlHeader);

            // Main Container
            Panel pnlMain = new Panel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(20, 80, 20, 20)
            };

            Label lblInputHeader = new Label
            {
                Text = "Заголовок для панели задач:",
                ForeColor = Color.FromArgb(203, 213, 225),
                Location = new Point(20, 75),
                AutoSize = true
            };
            this.Controls.Add(lblInputHeader);

            txtCustomTitle = new TextBox
            {
                Location = new Point(20, 100),
                Width = 325,
                Height = 30,
                BackColor = Color.FromArgb(30, 41, 59),
                ForeColor = Color.White,
                BorderStyle = BorderStyle.FixedSingle,
                Font = new Font("Segoe UI", 10.5f)
            };
            txtCustomTitle.Text = "Thorium";
            this.Controls.Add(txtCustomTitle);

            // Mode Group
            GroupBox grpMode = new GroupBox
            {
                Text = "Режим отображения в панели задач",
                ForeColor = Color.FromArgb(148, 163, 184),
                Location = new Point(20, 145),
                Size = new Size(325, 120),
                BackColor = Color.Transparent
            };

            rbReplace = new RadioButton
            {
                Text = "Строго введенный текст (например: Thorium)",
                ForeColor = Color.FromArgb(241, 245, 249),
                Location = new Point(14, 25),
                AutoSize = true,
                Checked = true
            };

            rbRemoveSuffix = new RadioButton
            {
                Text = "Отрезать суффикс браузера (без ' - Thorium')",
                ForeColor = Color.FromArgb(241, 245, 249),
                Location = new Point(14, 55),
                AutoSize = true
            };

            rbPrefix = new RadioButton
            {
                Text = "Префикс (Текст | Оригинал)",
                ForeColor = Color.FromArgb(241, 245, 249),
                Location = new Point(14, 85),
                AutoSize = true
            };

            grpMode.Controls.Add(rbReplace);
            grpMode.Controls.Add(rbRemoveSuffix);
            grpMode.Controls.Add(rbPrefix);
            this.Controls.Add(grpMode);

            // Action Button
            btnToggle = new Button
            {
                Text = "Включить замену",
                Location = new Point(20, 280),
                Size = new Size(325, 42),
                BackColor = Color.FromArgb(37, 99, 235),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 10.5f, FontStyle.Bold),
                Cursor = Cursors.Hand
            };
            btnToggle.FlatAppearance.BorderSize = 0;
            btnToggle.Click += BtnToggle_Click;
            this.Controls.Add(btnToggle);

            // Auto-start CheckBox
            chkAutoStart = new CheckBox
            {
                Text = "Запускать свернутым в трей",
                ForeColor = Color.FromArgb(148, 163, 184),
                Location = new Point(20, 335),
                AutoSize = true
            };
            this.Controls.Add(chkAutoStart);

            this.FormClosing += MainForm_FormClosing;
        }

        private void SetupTray()
        {
            trayMenu = new ContextMenuStrip();
            trayMenu.Items.Add("Открыть окно", null, (s, e) => ShowFromTray());
            trayMenu.Items.Add("Вкл / Выкл", null, (s, e) => ToggleState(!isRunning));
            trayMenu.Items.Add("-");
            trayMenu.Items.Add("Выход", null, (s, e) => ExitApplication());

            trayIcon = new NotifyIcon
            {
                Text = "Browser Nametag",
                Icon = SystemIcons.Application,
                ContextMenuStrip = trayMenu,
                Visible = true
            };
            trayIcon.DoubleClick += (s, e) => ShowFromTray();
        }

        private void ShowFromTray()
        {
            this.Show();
            this.WindowState = FormWindowState.Normal;
            this.BringToFront();
        }

        private void ExitApplication()
        {
            updateTimer.Stop();
            RestoreAllTitles();
            SaveSettings();
            trayIcon.Visible = false;
            Application.Exit();
        }

        private void MainForm_FormClosing(object sender, FormClosingEventArgs e)
        {
            if (e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                this.Hide();
                trayIcon.ShowBalloonTip(1500, "Browser Nametag", "Программа свернута в системный трей", ToolTipIcon.Info);
            }
        }

        private void BtnToggle_Click(object sender, EventArgs e)
        {
            ToggleState(!isRunning);
        }

        private void ToggleState(bool state)
        {
            isRunning = state;
            if (isRunning)
            {
                btnToggle.Text = "Остановить замену";
                btnToggle.BackColor = Color.FromArgb(220, 38, 38);
                lblStatus.Text = "[ Работает ]";
                lblStatus.ForeColor = Color.FromArgb(34, 197, 94);
                updateTimer.Start();
                ProcessBrowserWindows();
            }
            else
            {
                btnToggle.Text = "Включить замену";
                btnToggle.BackColor = Color.FromArgb(37, 99, 235);
                lblStatus.Text = "[ Выключено ]";
                lblStatus.ForeColor = Color.FromArgb(239, 68, 68);
                updateTimer.Stop();
                RestoreAllTitles();
            }
            SaveSettings();
        }

        private void UpdateTimer_Tick(object sender, EventArgs e)
        {
            if (isRunning)
            {
                ProcessBrowserWindows();
            }
        }

        private void ProcessBrowserWindows()
        {
            string customText = txtCustomTitle.Text.Trim();

            EnumWindows((hWnd, lParam) =>
            {
                if (!IsWindowVisible(hWnd))
                    return true;

                StringBuilder classBuilder = new StringBuilder(256);
                GetClassName(hWnd, classBuilder, 256);
                string className = classBuilder.ToString();

                // Check Chromium / Firefox top level window classes
                bool isTargetClass = className == "Chrome_WidgetWin_1" || 
                                     className == "MozillaWindowClass" || 
                                     className == "ApplicationFrameWindow";

                uint pid;
                GetWindowThreadProcessId(hWnd, out pid);

                bool isBrowserProcess = false;
                try
                {
                    using (Process proc = Process.GetProcessById((int)pid))
                    {
                        string pName = proc.ProcessName.ToLower();
                        foreach (string bp in knownBrowserProcesses)
                        {
                            if (pName.Contains(bp))
                            {
                                isBrowserProcess = true;
                                break;
                            }
                        }
                    }
                }
                catch { }

                if (!isTargetClass && !isBrowserProcess)
                    return true;

                int length = GetWindowTextLength(hWnd);
                if (length == 0)
                    return true;

                StringBuilder titleBuilder = new StringBuilder(length + 1);
                GetWindowText(hWnd, titleBuilder, length + 1);
                string currentTitle = titleBuilder.ToString();

                if (string.IsNullOrEmpty(currentTitle))
                    return true;

                // Save original title if not recorded
                if (!originalTitles.ContainsKey(hWnd))
                {
                    originalTitles[hWnd] = currentTitle;
                }

                string targetTitle = "";

                if (rbReplace.Checked)
                {
                    targetTitle = string.IsNullOrEmpty(customText) ? "Browser" : customText;
                }
                else if (rbRemoveSuffix.Checked)
                {
                    // Remove " - Thorium", " - Google Chrome", etc.
                    targetTitle = CleanSuffix(currentTitle);
                }
                else if (rbPrefix.Checked)
                {
                    string cleaned = CleanSuffix(currentTitle);
                    targetTitle = string.IsNullOrEmpty(customText) ? cleaned : customText + " | " + cleaned;
                }

                if (!string.IsNullOrEmpty(targetTitle) && currentTitle != targetTitle)
                {
                    SetWindowText(hWnd, targetTitle);
                }

                return true;
            }, IntPtr.Zero);
        }

        private string CleanSuffix(string title)
        {
            string[] suffixes = new string[]
            {
                " - Thorium", " - Google Chrome", " - Chromium", " - Microsoft​ Edge", " - Brave", " - Mozilla Firefox", " - Vivaldi", " - Opera", " - Yandex"
            };

            foreach (string s in suffixes)
            {
                if (title.EndsWith(s, StringComparison.OrdinalIgnoreCase))
                {
                    return title.Substring(0, title.Length - s.Length);
                }
            }
            return title;
        }

        private void RestoreAllTitles()
        {
            foreach (var kvp in originalTitles)
            {
                if (IsWindowVisible(kvp.Key))
                {
                    SetWindowText(kvp.Key, kvp.Value);
                }
            }
            originalTitles.Clear();
        }

        private void SaveSettings()
        {
            try
            {
                string dir = Path.GetDirectoryName(ConfigPath);
                if (!Directory.Exists(dir))
                    Directory.CreateDirectory(dir);

                string content = string.Format(
                    "Running={0}\nCustomTitle={1}\nMode={2}\nAutoStart={3}",
                    isRunning,
                    txtCustomTitle.Text,
                    rbReplace.Checked ? "Replace" : (rbRemoveSuffix.Checked ? "RemoveSuffix" : "Prefix"),
                    chkAutoStart.Checked
                );
                File.WriteAllText(ConfigPath, content);
            }
            catch { }
        }

        private void LoadSettings()
        {
            try
            {
                if (File.Exists(ConfigPath))
                {
                    string[] lines = File.ReadAllLines(ConfigPath);
                    foreach (string line in lines)
                    {
                        string[] parts = line.Split(new char[] { '=' }, 2);
                        if (parts.Length == 2)
                        {
                            string key = parts[0].Trim();
                            string val = parts[1].Trim();

                            if (key == "Running") bool.TryParse(val, out isRunning);
                            else if (key == "CustomTitle") txtCustomTitle.Text = val;
                            else if (key == "Mode")
                            {
                                rbReplace.Checked = val == "Replace";
                                rbRemoveSuffix.Checked = val == "RemoveSuffix";
                                rbPrefix.Checked = val == "Prefix";
                            }
                            else if (key == "AutoStart") chkAutoStart.Checked = (val == "True");
                        }
                    }
                }
            }
            catch { }

            if (isRunning)
            {
                btnToggle.Text = "Остановить замену";
                btnToggle.BackColor = Color.FromArgb(220, 38, 38);
                lblStatus.Text = "[ Работает ]";
                lblStatus.ForeColor = Color.FromArgb(34, 197, 94);
            }
        }

        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }
}
