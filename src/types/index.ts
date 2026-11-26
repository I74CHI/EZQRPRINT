import type { Timestamp } from "firebase/firestore";

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
  };
  dailyCounter: number;
  lastOrderDate: string;
  createdAt: Timestamp;
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
  paymentClaimed: boolean;
  filesPurged: boolean;
  totalAmount: number;
  finalAmount: number;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  files: OrderFile[];
}
