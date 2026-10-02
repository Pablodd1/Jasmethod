// Official next/font test hook. SSR/API acceptance does not validate typography.
// local() produces a valid font face without downloading or inventing font bytes.
module.exports = new Proxy({}, {
  get(_target, url) {
    const family = typeof url === 'string' ? new URL(url).searchParams.get('family').split(':')[0] : 'Synthetic';
    return `@font-face { font-family: '${family}'; src: local('Arial'); font-style: normal; font-weight: 100 900; }`;
  },
});
