declare module 'seeso/easy-seeso' {
  const EasySeeSo: any
  export default EasySeeSo
}

// CSS Modules
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
