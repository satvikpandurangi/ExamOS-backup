import os
import requests
import socketio
url = os.environ['EXAMOS_TLS_URL']
try:
    requests.get(url+'/api/health', timeout=4)
    raise AssertionError('Untrusted server certificate was accepted')
except requests.exceptions.SSLError:
    pass
session = requests.Session()
session.verify = os.environ['EXAMOS_TLS_CA']
assert session.get(url+'/api/health', timeout=4).json()['ok']
client = socketio.Client(http_session=session, reconnection=False)
client.connect(url, auth={'token': os.environ['EXAMOS_TLS_DEVICE_TOKEN']}, transports=['websocket'])
assert client.call('heartbeat', {}, timeout=4)['session'] is None
client.disconnect()
print('PASS: untrusted certificate rejected; trusted HTTPS and WSS authenticated successfully.')
