async function inspectGomoku() {
  try {
    const res = await fetch('https://gomoku.com/vi/single-player/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    console.log('HTTP Status Code:', res.status);
    const html = await res.text();
    console.log('HTML Length:', html.length);
    console.log('First 500 chars:', html.slice(0, 500));

    // Extract script tags
    const scriptRegex = /<script[^>]+src=["']([^"']+)["']/g;
    let match;
    const scripts = [];
    while ((match = scriptRegex.exec(html)) !== null) {
      scripts.push(match[1]);
    }
    console.log('Discovered Script Tags:', scripts);

    // Search for keywords in inline scripts or html
    const keywords = ['wasm', 'worker', 'minimax', 'alpha', 'eval', 'depth', 'bot', 'engine', 'gomoku'];
    keywords.forEach(kw => {
      const count = (html.match(new RegExp(kw, 'gi')) || []).length;
      console.log(`Keyword "${kw}" count:`, count);
    });

  } catch (err) {
    console.error('Fetch Error:', err);
  }
}

inspectGomoku();
