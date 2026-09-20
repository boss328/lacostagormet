declare module '@amazonpay/amazon-pay-api-sdk-nodejs' {
  export class WebStoreClient {
    constructor(config: { publicKeyId: string; privateKey: string; region: string; sandbox: boolean; algorithm: string });
    generateButtonSignature(payload: string): string;
    getCheckoutSession(id: string): Promise<{ data: string }>;
    updateCheckoutSession(id: string, payload: unknown): Promise<{ data: string }>;
    completeCheckoutSession(id: string, payload: unknown, headers: Record<string, string>): Promise<{ data: string }>;
    getCharge(id: string): Promise<{ data: string }>;
  }
}
