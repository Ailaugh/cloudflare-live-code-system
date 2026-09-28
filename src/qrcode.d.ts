declare module 'qrcode' {
  type SvgOptions = {
    type: 'svg'
    margin?: number
    width?: number
    color?: {
      dark?: string
      light?: string
    }
  }

  const QRCode: {
    toString(value: string, options: SvgOptions): Promise<string>
  }

  export default QRCode
}
