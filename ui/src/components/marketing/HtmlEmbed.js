'use client';

import { useEffect, useRef } from 'react';
import styles from './MarketingSite.module.css';

function runEmbedScripts(container) {
  container.querySelectorAll('script').forEach((oldScript) => {
    const newScript = document.createElement('script');
    Array.from(oldScript.attributes).forEach((attribute) => {
      newScript.setAttribute(attribute.name, attribute.value);
    });
    newScript.textContent = oldScript.textContent;
    oldScript.replaceWith(newScript);
  });
}

export default function HtmlEmbed({ html, caption, className = '' }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !html) return;

    container.innerHTML = html;
    runEmbedScripts(container);
  }, [html]);

  if (!html) return null;

  return (
    <figure className={`${styles.htmlEmbed} ${className}`.trim()}>
      <div ref={containerRef} />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
