# OctaShield - Centralized VM Monitoring Dashboard & WhatsApp Gateway

OctaShield is a self-hosted, lightweight, and completely free centralized monitoring dashboard for virtualized machines (VMs). It displays real-time resource utilization (CPU, RAM, Disk, Uptime) in a premium glassmorphic dark-themed Web UI and includes a two-way WhatsApp automation bot for instant alerting and interactive querying.

---

## 🚀 Key Features

*   📺 **Glassmorphic Dark-Mode UI**: A premium responsive dashboard built with React and WebSockets for real-time, zero-refresh metric updates.
*   🔌 **Dual-Mode Polling**:
    *   **Agentless SSH (Linux)**: Queries target Linux machines securely using key or password auth. Requires **zero** software installation on the target VM.
    *   **Lightweight Agent (Windows/Linux)**: A simple Python script (`agent.py`) using `psutil` that runs as a lightweight service. Perfect for Windows nodes or strict firewall environments.
*   💬 **Free Two-Way WhatsApp Bot**:
    *   **Interactive Command Menu**: Text `!status` to your bot's WhatsApp number to get a numbered list of all VMs, then reply with a number to receive a detailed system report card.
    *   **Automatic Threshold Alerts**: Automatically sends alert notifications to a specific phone number or group chat if CPU, RAM, or Disk space crosses warning levels, or if a VM goes offline.
*   🔒 **Zero-Config Database**: Powered by SQLite for zero-setup deployments on both Linux and Windows.
*   🛡️ **Built with Security in Mind**: Out of the box `.gitignore` keeps your SQLite database (containing VM credentials and IPs) and local WhatsApp session data strictly offline and safe.

---

## 🛠️ Technology Stack

*   **Frontend**: React (Vite), Outfit Google Font, CSS3 Custom Properties (Glassmorphism), Lucide Icons
*   **Backend**: Node.js, Express, WebSockets (`ws`)
*   **Database**: SQLite (`sqlite3`)
*   **SSH Client**: `ssh2`
*   **WhatsApp Gateway**: `@whiskeysockets/baileys` (runs headless without Puppeteer/Chrome dependencies)
*   **VM Agent**: Python 3, `psutil`

---

## ⚙️ Installation & Deployment

### 1. Set Up the Dashboard Server

Ensure you have **Node.js (v18+)** installed.

```bash
# Clone the repository
git clone https://github.com/Thilina-jay/vm-monitoring-whatsapp-dashboard.git
cd vm-monitoring-whatsapp-dashboard

# Install dependencies
npm install

# Build the frontend production assets
npm run build

# Start the dashboard backend
npm run start
```

Open your browser and navigate to: **`http://localhost:3000`**

---

### 2. Configure Your Target Virtual Machines

#### A. Linux VMs (Agentless SSH)
Ensure SSH is enabled on the target VM and you have valid credentials (password or SSH private key).
*   Go to the Dashboard Web UI &rarr; Click **Register VM**.
*   Select **SSH (Linux Agentless)**, enter the IP, port `22`, username, and auth credentials.

#### B. Windows 10/11 VMs (HTTP Agent)
If you want to monitor a Windows host:
1.  Copy the [src/agent/agent.py](src/agent/agent.py) script onto the target Windows PC.
2.  Open **Command Prompt** (cmd) on the Windows PC and install `psutil`:
    ```cmd
    pip install psutil
    ```
3.  Start the agent:
    ```cmd
    python agent.py
    ```
    *Note: The agent will listen on port `5001`.*
4.  On the Dashboard Web UI, click **Register VM**, select **Agent (HTTP Port)**, enter the Windows IP, and set target port to `5001`.

---

## 📲 Setting Up WhatsApp Automation

1.  Open the web dashboard and click the **Configurations** tab.
2.  Toggle **Enable WhatsApp Alerts** to **ON**.
3.  In **WhatsApp Alert Recipient**, enter your notification phone number (e.g. `94771234567` using your country code *without* spaces or `+`) or a group JID (e.g. `120363028392019@g.us`).
4.  Click **Save Configurations**. A **QR Code** will instantly load on the right panel.
5.  Open **WhatsApp** on a secondary phone &rarr; **Settings** &rarr; **Linked Devices** &rarr; **Link a Device** and scan the QR code.
6.  Once connected, the status on the web dashboard updates to **🟢 Active Connection**.

### WhatsApp Commands
Text the following command to your Bot's phone number:
*   `!status` or `!vms` – Requests the list of all registered VMs.
*   `[Number]` (e.g., `1`, `2`) – After requesting the list, reply with the index number of a VM to receive its formatted live system report card.

---

## 📄 License
This project is open-source and free to use under the MIT License.

*Disclaimer: This project uses a self-hosted library to interact with WhatsApp Web. To protect your personal account from spam filters, we highly recommend using a dedicated, secondary SIM card/phone number for your bot.*
