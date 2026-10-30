"""Bounded decode validation. Reads private upload from stdin; never writes media to disk."""
import io
import json
import sys

try:
    import av
    data = sys.stdin.buffer.read(2 * 1024 * 1024 + 1)
    if len(data) > 2 * 1024 * 1024 or not data.startswith(b'\x1a\x45\xdf\xa3'):
        raise ValueError('A WebM clip of at most 2 MB is required')
    with av.open(io.BytesIO(data), mode='r', format='matroska') as media:
        if len(media.streams) != 1 or len(media.streams.video) != 1:
            raise ValueError('Exactly one video stream and no audio are permitted')
        stream = media.streams.video[0]
        if stream.codec_context.name != 'vp8' or not (1 <= stream.width <= 320 and 1 <= stream.height <= 240):
            raise ValueError('Only VP8 video up to 320x240 is permitted')
        count, first, last = 0, None, None
        for packet_count, packet in enumerate(media.demux(stream)):
            if packet_count > 200:
                raise ValueError('Too many video packets')
            for frame in packet.decode():
                stamp = float(frame.pts * frame.time_base)
                first = stamp if first is None else first
                if last is not None and stamp <= last:
                    raise ValueError('Invalid video timestamps')
                last = stamp
                count += 1
                if frame.width > 320 or frame.height > 240 or count > 100 or stamp - first > 21:
                    raise ValueError('Clip exceeds duration, dimensions or frame limit')
        if count < 2 or first is None or last - first < .1:
            raise ValueError('Clip has insufficient decodable frames')
        print(json.dumps({'codec': 'vp8', 'mime': 'video/webm', 'frames': count,
                          'durationSeconds': round(last - first, 3), 'audio': False,
                          'width': stream.width, 'height': stream.height}))
except Exception as exc:
    print(json.dumps({'error': str(exc)}))
    raise SystemExit(1)
