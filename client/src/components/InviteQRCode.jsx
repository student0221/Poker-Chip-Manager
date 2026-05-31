import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function InviteQRCode({ value, label = '\u626b\u7801\u52a0\u5165', size = 144 }) {
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    let active = true;
    if (!value) {
      setDataUrl('');
      return undefined;
    }

    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    })
      .then(url => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) return null;

  return (
    <div className="inline-flex flex-col items-center gap-2 rounded-2xl bg-white p-3 border border-slate-100 shadow-sm">
      <img src={dataUrl} alt={label} width={size} height={size} className="rounded-lg" />
      <div className="text-xs font-semibold text-slate-500">{label}</div>
    </div>
  );
}
