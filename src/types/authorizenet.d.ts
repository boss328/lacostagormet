/**
 * Ambient declaration for the `authorizenet` npm package (the official SDK).
 *
 * The package ships without .d.ts files. We only consume a narrow surface —
 * merchant auth, opaque-data payment, an auth-capture transaction request,
 * and the execute/getResponse pair — so declare just those. Anything else
 * is typed loosely to avoid chasing their full XML schema.
 */

declare module 'authorizenet' {
  namespace APIContracts {
    class MerchantAuthenticationType {
      setName(v: string): void;
      setTransactionKey(v: string): void;
    }
    class OpaqueDataType {
      setDataDescriptor(v: string): void;
      setDataValue(v: string): void;
    }
    class PaymentType {
      setOpaqueData(v: OpaqueDataType): void;
    }
    class CustomerDataType {
      setEmail(v: string): void;
    }
    class CustomerAddressType {
      setFirstName(v: string): void;
      setLastName(v: string): void;
      setCompany(v: string): void;
      setAddress(v: string): void;
      setCity(v: string): void;
      setState(v: string): void;
      setZip(v: string): void;
      setCountry(v: string): void;
      setPhoneNumber(v: string): void;
    }
    class TransactionRequestType {
      setTransactionType(v: string): void;
      setAmount(v: number): void;
      setPayment(v: PaymentType): void;
      setCustomer(v: CustomerDataType): void;
      setBillTo(v: CustomerAddressType): void;
      setShipTo(v: CustomerAddressType): void;
      // Note: setRefId is NOT on this class — it lives on
      // CreateTransactionRequest (the wrapping envelope).
    }
    class CreateTransactionRequest {
      setMerchantAuthentication(v: MerchantAuthenticationType): void;
      setTransactionRequest(v: TransactionRequestType): void;
      setRefId(v: string): void;
      getJSON(): unknown;
    }

    // Response shapes — the SDK returns getter-functions for every field.
    // We read via optional chaining and tolerate any shape.
    interface SdkMessage {
      getCode?(): string;
      getText?(): string;
      getDescription?(): string;
    }
    interface SdkMessageList {
      getResultCode?(): string;
      getMessage?(): SdkMessage[];
    }
    interface SdkError {
      getErrorCode?(): string;
      getErrorText?(): string;
    }
    interface SdkErrorList {
      getError?(): SdkError[];
    }
    interface SdkTransactionResponse {
      getResponseCode?(): string;
      getTransId?(): string;
      getAuthCode?(): string;
      getAvsResultCode?(): string;
      getCvvResultCode?(): string;
      getAccountNumber?(): string;
      getAccountType?(): string;
      getMessages?(): SdkMessageList;
      getErrors?(): SdkErrorList;
    }
    class CreateTransactionResponse {
      constructor(raw: unknown);
      getMessages?(): SdkMessageList;
      getTransactionResponse?(): SdkTransactionResponse | null;
    }

    const TransactionTypeEnum: {
      AUTHCAPTURETRANSACTION: string;
      AUTHONLYTRANSACTION: string;
      VOIDTRANSACTION: string;
      REFUNDTRANSACTION: string;
    };

    // --- Lookup / reporting API (used by scripts/backfill-order-payment.ts) ---

    interface SdkCreditCard {
      getCardNumber?(): string;
      getCardType?(): string;
      getExpirationDate?(): string;
    }
    interface SdkPayment {
      getCreditCard?(): SdkCreditCard | null;
    }
    interface SdkTransactionDetails {
      getResponseCode?(): string;
      getAuthCode?(): string;
      getTransId?(): string;
      getRefId?(): string;
      getInvoiceNumber?(): string;
      getAuthAmount?(): string;
      getSettleAmount?(): string;
      getAVSResponse?(): string;
      getCardCodeResponse?(): string;
      getPayment?(): SdkPayment | null;
      getMessages?(): SdkMessageList;
    }

    class TransactionListSorting {
      setOrderBy(field: string): void;
      setOrderDescending(desc: boolean): void;
    }

    class GetUnsettledTransactionListRequest {
      setMerchantAuthentication(v: MerchantAuthenticationType): void;
      setSorting(v: TransactionListSorting): void;
      getJSON(): unknown;
    }
    class GetUnsettledTransactionListResponse {
      constructor(raw: unknown);
      getMessages?(): SdkMessageList;
      getTransactions?(): { getTransaction?(): SdkTransactionDetails[] };
    }

    class GetTransactionDetailsRequest {
      setMerchantAuthentication(v: MerchantAuthenticationType): void;
      setTransId(id: string): void;
      getJSON(): unknown;
    }
    class GetTransactionDetailsResponse {
      constructor(raw: unknown);
      getMessages?(): SdkMessageList;
      getTransaction?(): SdkTransactionDetails | null;
    }

    const TransactionListOrderFieldEnum: {
      ID: string;
      SUBMITTIMEUTC: string;
    };
  }

  namespace APIControllers {
    class CreateTransactionController {
      constructor(request: unknown);
      setEnvironment(endpoint: string): void;
      execute(cb: () => void): void;
      getResponse(): unknown;
    }
    class GetUnsettledTransactionListController {
      constructor(request: unknown);
      setEnvironment(endpoint: string): void;
      execute(cb: () => void): void;
      getResponse(): unknown;
    }
    class GetTransactionDetailsController {
      constructor(request: unknown);
      setEnvironment(endpoint: string): void;
      execute(cb: () => void): void;
      getResponse(): unknown;
    }
  }

  namespace Constants {
    const endpoint: {
      sandbox: string;
      production: string;
    };
  }
}
