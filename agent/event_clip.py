"""Silent event-only WebM encoding, entirely in memory. No camera access here."""
from fractions import Fraction
import io
import av
import cv2
import numpy as np


def encode_clip(frames, permitted=lambda: True):
    if len(frames) < 2:
        raise ValueError('Not enough consented frames for an event clip')
    output = io.BytesIO()
    with av.open(output, mode='w', format='webm') as container:
        stream = container.add_stream('libvpx', rate=4)
        stream.width, stream.height = 320, 240
        stream.pix_fmt = 'yuv420p'
        stream.bit_rate = 140000
        stream.options = {'deadline': 'realtime', 'cpu-used': '8'}
        stream.time_base = Fraction(1, 1000)
        first = frames[0][0]
        previous = -1
        for stamp, _, jpeg in frames:
            if not permitted():
                raise InterruptedError('Clip consent ended; buffered frames discarded')
            image = cv2.imdecode(np.frombuffer(jpeg, dtype=np.uint8), cv2.IMREAD_COLOR)
            frame = av.VideoFrame.from_ndarray(image, format='bgr24')
            frame.pts = max(previous + 1, round((stamp - first) * 1000))
            frame.time_base = Fraction(1, 1000)
            previous = frame.pts
            for packet in stream.encode(frame):
                container.mux(packet)
        for packet in stream.encode():
            container.mux(packet)
    data = output.getvalue()
    if len(data) > 2 * 1024 * 1024:
        raise ValueError('Event clip exceeds the 2 MB limit')
    return data
