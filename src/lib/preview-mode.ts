/** Review deployments use production catalog reads without creating real orders. */
export function isReadOnlyPreview() {
  return (
    process.env.READ_ONLY_PREVIEW === 'true' ||
    (process.env.VERCEL_ENV === 'preview' &&
      process.env.READ_ONLY_PREVIEW !== 'false')
  );
}
export function isPreviewWrite(method: string, pathname: string) {
  const path = pathname.replace(/\/$/, '');
  if (['/api/admin/login', '/api/admin/logout'].includes(path)) return false;
  if (
    path.startsWith('/api/cron/') ||
    path === '/auth/callback' ||
    path === '/unsubscribe'
  )
    return true;
  if (
    path.startsWith('/api/checkout/') &&
    path !== '/api/checkout/wallet/config'
  )
    return true;
  return !['GET', 'HEAD', 'OPTIONS'].includes(method);
}
