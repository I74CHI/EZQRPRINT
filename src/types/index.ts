export interface AppTimestamp {
  toDate(): Date;
}

export interface Shop {
  id: string;
  ownerUid: string;
  shopName: string;
  slug: string;
  upiId?: string;
  upiPayeeName?: string;
  rates: {
    bwPerPage: number;
    colorPerPage: number;
    bwDoubleSidedPerPage: number;
    colorDoubleSidedPerPage: number;
  };
  dailyCounter: number;
  lastOrderDate: string;
  createdAt: AppTimestamp;
}

export interface PublicShop {
  id: string;
  shopName: string;
  slug: string;
  upiId?: string;
  upiPayeeName?: string;
  rates: {
    bwPerPage: number;
    colorPerPage: number;
    bwDoubleSidedPerPage: number;
    colorDoubleSidedPerPage: number;
  };
}

export interface OrderFile {
  fileName: string;
  storagePath: string;
  downloadUrl: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  pageCount: number;
  copies: number;
  colorMode: "bw" | "color";
  printSides?: "single" | "double";
  printNote: "standard" | "id-card";
  itemCost: number;
}

export interface Order {
  id: string;
  shopId: string;
  tokenNumber: number;
  status: "pending" | "printing" | "awaiting_payment" | "completed";
  filesPurged: boolean;
  totalAmount: number;
  finalAmount: number;
  createdAt: AppTimestamp;
  expiresAt: AppTimestamp;
  files: OrderFile[];
}
