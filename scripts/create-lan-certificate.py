"""Create a local CA and server certificate. Never install trust automatically."""
import argparse
import datetime
import ipaddress
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID

parser = argparse.ArgumentParser()
parser.add_argument('--host', action='append', required=True, help='DNS name or IP students use; may repeat')
parser.add_argument('--out', default='data/tls')
args = parser.parse_args()
out = Path(args.out)
out.mkdir(parents=True, exist_ok=True)
if (out / 'ca.key').exists():
    raise SystemExit('Certificate directory already has a CA; refusing to overwrite.')
now = datetime.datetime.now(datetime.timezone.utc)
ca_key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'ExamOS Local Examination CA')])
ca = (x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name).public_key(ca_key.public_key())
      .serial_number(x509.random_serial_number()).not_valid_before(now-datetime.timedelta(minutes=5))
      .not_valid_after(now+datetime.timedelta(days=365)).add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
      .add_extension(x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()), critical=False)
      .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
      .add_extension(x509.KeyUsage(False, False, False, False, False, True, True, False, False), critical=True).sign(ca_key, hashes.SHA256()))
key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
names = []
for host in args.host:
    try:
        names.append(x509.IPAddress(ipaddress.ip_address(host)))
    except ValueError:
        names.append(x509.DNSName(host))
cert = (x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, args.host[0])]))
        .issuer_name(ca_name).public_key(key.public_key()).serial_number(x509.random_serial_number())
        .not_valid_before(now-datetime.timedelta(minutes=5)).not_valid_after(now+datetime.timedelta(days=90))
        .add_extension(x509.SubjectAlternativeName(names), critical=False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
        .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
        .add_extension(x509.KeyUsage(True, False, True, False, False, False, False, False, False), critical=True)
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False).sign(ca_key, hashes.SHA256()))
for filename, value in [('ca.crt', ca.public_bytes(serialization.Encoding.PEM)), ('server.crt', cert.public_bytes(serialization.Encoding.PEM)), ('ca.key', ca_key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())), ('server.key', key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))]:
    (out / filename).write_bytes(value)
print('Created CA and server certificate in', out)
print('Keep private keys on the instructor host. Distribute only ca.crt through a trusted channel.')
print('Set TLS_CERT and TLS_KEY to server.crt and server.key. On agents set REQUESTS_CA_BUNDLE to ca.crt.')
