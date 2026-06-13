enum ProductTrackingType {
  BULK
  SERIALIZED
}

enum InventoryUnitStatus {
  IN_STOCK
  SOLD
  TRADED_IN
  RETURNED
  DAMAGED
}

enum InventoryMovementType {
  PURCHASE
  SALE
  ADJUSTMENT
  TRADE_IN
  TRADE_OUT
  RETURN
}

enum TransactionType {
  SALE
  PURCHASE
  TRADE_IN
}

model Product {
  id            Int                 @id @default(autoincrement())
  name          String
  sku           String?             @unique
  category      String?
  brand         String?
  model         String?
  price         Float               // default selling price
  costPrice     Float?              // optional default cost
  reorderLevel  Int                 @default(0)
  trackingType  ProductTrackingType
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt

  bulkStock     BulkStock?
  units         InventoryUnit[]
  purchaseItems PurchaseItem[]
  saleItems     SaleItem[]
  tradeInItems  TradeInItem[]
}

model BulkStock {
  id         Int      @id @default(autoincrement())
  productId  Int      @unique
  quantity   Int      @default(0)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  product    Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
}

model InventoryUnit {
  id            Int                 @id @default(autoincrement())
  productId     Int
  sku           String?             @unique
  imei          String?             @unique
  imei2         String?             @unique
  serialNumber  String?             @unique
  condition     String?
  color         String?
  batteryHealth Int?
  status        InventoryUnitStatus @default(IN_STOCK)
  costPrice     Float?
  sellingPrice  Float?
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt

  product       Product             @relation(fields: [productId], references: [id], onDelete: Cascade)
  saleItem      SaleItem?
  tradeInItem   TradeInItem?
  movements     InventoryMovement[]

  @@index([imei])
  @@index([imei2])
  @@index([serialNumber])
  @@index([productId, status])
}

model Supplier {
  id          Int        @id @default(autoincrement())
  name        String
  phone       String?
  email       String?
  address     String?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  purchases   Purchase[]
}

model Customer {
  id          Int        @id @default(autoincrement())
  name        String
  phone       String?
  email       String?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  sales       Sale[]
  tradeIns    TradeIn[]
}

model Purchase {
  id           Int            @id @default(autoincrement())
  supplierId   Int?
  reference    String?        @unique
  totalCost    Float          @default(0)
  note         String?
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt

  supplier     Supplier?      @relation(fields: [supplierId], references: [id], onDelete: SetNull)
  items        PurchaseItem[]
}

model PurchaseItem {
  id            Int      @id @default(autoincrement())
  purchaseId    Int
  productId     Int
  quantity      Int?     // used for BULK items
  unitCost      Float
  unitPrice     Float?   // optional selling suggestion

  purchase      Purchase @relation(fields: [purchaseId], references: [id], onDelete: Cascade)
  product       Product  @relation(fields: [productId], references: [id])

  @@index([purchaseId])
  @@index([productId])
}

model Sale {
  id           Int        @id @default(autoincrement())
  customerId   Int?
  reference    String?    @unique
  subtotal     Float      @default(0)
  discount     Float      @default(0)
  totalAmount  Float      @default(0)
  note         String?
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  customer     Customer?  @relation(fields: [customerId], references: [id], onDelete: SetNull)
  items        SaleItem[]
}

model SaleItem {
  id             Int            @id @default(autoincrement())
  saleId         Int
  productId      Int
  inventoryUnitId Int?          @unique // for serialized items
  quantity       Int?           // for bulk items
  unitPrice      Float
  unitCost       Float?
  totalPrice     Float

  sale           Sale           @relation(fields: [saleId], references: [id], onDelete: Cascade)
  product        Product        @relation(fields: [productId], references: [id])
  inventoryUnit  InventoryUnit? @relation(fields: [inventoryUnitId], references: [id], onDelete: SetNull)

  @@index([saleId])
  @@index([productId])
}

model TradeIn {
  id              Int           @id @default(autoincrement())
  customerId      Int?
  reference       String?       @unique
  offeredValue    Float         // value given to customer for old phone
  cashDifference  Float         @default(0) // extra cash paid by customer
  note            String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  customer        Customer?     @relation(fields: [customerId], references: [id], onDelete: SetNull)
  items           TradeInItem[]
}

model TradeInItem {
  id              Int            @id @default(autoincrement())
  tradeInId       Int
  productId       Int
  inventoryUnitId Int?           @unique
  quantity        Int?           // only if ever needed for bulk trade-in
  tradeValue      Float
  condition       String?

  tradeIn         TradeIn        @relation(fields: [tradeInId], references: [id], onDelete: Cascade)
  product         Product        @relation(fields: [productId], references: [id])
  inventoryUnit   InventoryUnit? @relation(fields: [inventoryUnitId], references: [id], onDelete: SetNull)

  @@index([tradeInId])
  @@index([productId])
}

model InventoryMovement {
  id              Int                   @id @default(autoincrement())
  productId       Int
  inventoryUnitId Int?
  type            InventoryMovementType
  quantity        Int                   @default(0)
  unitCost        Float?
  unitPrice       Float?
  reference       String?
  note            String?
  createdAt       DateTime              @default(now())

  product         Product               @relation(fields: [productId], references: [id], onDelete: Cascade)
  inventoryUnit   InventoryUnit?        @relation(fields: [inventoryUnitId], references: [id], onDelete: SetNull)

  @@index([productId, createdAt])
  @@index([inventoryUnitId])
}