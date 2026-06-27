import http.server
import json
import time
import platform
import sys

# Verify dependency is met
try:
    import psutil
except ImportError:
    print("=================================================================")
    print(" ERROR: 'psutil' library is not installed.")
    print(" Please install it using pip:")
    print("   pip install psutil")
    print("=================================================================")
    sys.exit(1)

PORT = 5001

class MetricsHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Override to suppress standard HTTP logging in terminal to keep it clean
        pass

    def do_GET(self):
        if self.path == '/metrics':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            try:
                # Gather CPU percentage (over 0.1s sample)
                cpu = psutil.cpu_percent(interval=0.1)

                # Gather Memory metrics
                mem = psutil.virtual_memory()
                ram_data = {
                    "total": mem.total,
                    "used": mem.used,
                    "percent": mem.percent
                }

                # Gather Disk metrics based on OS
                disk_path = 'C:\\' if platform.system() == 'Windows' else '/'
                disk = psutil.disk_usage(disk_path)
                disk_data = {
                    "total": disk.total,
                    "used": disk.used,
                    "percent": disk.percent
                }

                # Calculate Uptime
                uptime = int(time.time() - psutil.boot_time())

                # Identify OS Name
                os_name = f"{platform.system()} {platform.release()}"
                if platform.system() == 'Linux':
                    # Attempt to get a cleaner distribution name on Linux
                    try:
                        with open('/etc/os-release', 'r') as f:
                            for line in f:
                                if line.startswith('PRETTY_NAME='):
                                    os_name = line.split('=')[1].strip().strip('"')
                                    break
                    except Exception:
                        pass

                payload = {
                    "cpu": cpu,
                    "ram": ram_data,
                    "disk": disk_data,
                    "uptime": uptime,
                    "os": os_name
                }

                self.wfile.write(json.dumps(payload).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not Found. Use /metrics to query stats.")

def run(server_class=http.server.HTTPServer, handler_class=MetricsHandler):
    server_address = ('', PORT)
    httpd = server_class(server_address, handler_class)
    print(f"============================================================")
    print(f"  OctaShield VM Client Agent Started Successfully")
    print(f"  - Local endpoint: http://localhost:{PORT}/metrics")
    print(f"  - OS Platform:    {platform.system()} ({platform.machine()})")
    print(f"============================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nAgent shutting down.")
        httpd.server_close()

if __name__ == '__main__':
    run()
