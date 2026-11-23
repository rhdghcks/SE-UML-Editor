import { useEffect, useState } from 'react';
import type { DiagramDocument } from '../../core/types';
import { MermaidRenderer } from '../../adapters/mermaid-renderer';

const renderer = new MermaidRenderer();

export function MermaidPreview({ document }: { document: DiagramDocument }) {
  const [result, setResult] = useState<{ url?: string; error?: string }>({});
  useEffect(() => {
    let active = true;
    let url = '';
    setResult({});
    renderer.render(document).then(svg => {
      if (!active) return;
      url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      setResult({ url });
    }).catch(error => { if (active) setResult({ error: String(error) }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [document, renderer]);
  if (result.error) return <p role="alert">{result.error}</p>;
  return result.url ? <img alt="Mermaid 자동 배치 결과" src={result.url} style={{ maxWidth: '100%' }} /> : <p>렌더링 중…</p>;
}
