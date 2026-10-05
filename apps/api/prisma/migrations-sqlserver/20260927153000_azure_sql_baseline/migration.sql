BEGIN TRY

BEGIN TRAN;

-- CreateSchema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'dbo') EXEC sp_executesql N'CREATE SCHEMA [dbo];';

-- CreateTable
CREATE TABLE [dbo].[User] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [email] NVARCHAR(254) COLLATE Latin1_General_100_CI_AS_SC,
    [phone] NVARCHAR(191) COLLATE Latin1_General_100_BIN2,
    [firstName] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [lastName] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [role] NVARCHAR(40) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [User_role_df] DEFAULT 'CUSTOMER',
    [marketingOptIn] BIT NOT NULL CONSTRAINT [User_marketingOptIn_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [User_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [User_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Address] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [userId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [label] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [firstName] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [lastName] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [phone] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [line1] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [line2] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [landmark] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [city] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [state] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [postalCode] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [countryCode] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [Address_countryCode_df] DEFAULT 'IN',
    [isDefault] BIT NOT NULL CONSTRAINT [Address_isDefault_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Address_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Address_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Category] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [name] NVARCHAR(max) COLLATE Latin1_General_100_CI_AS_SC NOT NULL,
    [slug] NVARCHAR(191) COLLATE Latin1_General_100_CI_AS_SC NOT NULL,
    [description] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [active] BIT NOT NULL CONSTRAINT [Category_active_df] DEFAULT 1,
    [position] INT NOT NULL CONSTRAINT [Category_position_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Category_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Category_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Category_slug_key] UNIQUE NONCLUSTERED ([slug])
);

-- CreateTable
CREATE TABLE [dbo].[Product] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [categoryId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2,
    [name] NVARCHAR(max) COLLATE Latin1_General_100_CI_AS_SC NOT NULL,
    [slug] NVARCHAR(191) COLLATE Latin1_General_100_CI_AS_SC NOT NULL,
    [shortDescription] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [description] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [fabric] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [care] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [status] NVARCHAR(40) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [Product_status_df] DEFAULT 'DRAFT',
    [featuredRank] INT NOT NULL CONSTRAINT [Product_featuredRank_df] DEFAULT 9999,
    [seoTitle] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [seoDescription] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Product_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Product_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Product_slug_key] UNIQUE NONCLUSTERED ([slug])
);

-- CreateTable
CREATE TABLE [dbo].[Collection] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [name] NVARCHAR(max) COLLATE Latin1_General_100_CI_AS_SC NOT NULL,
    [slug] NVARCHAR(191) COLLATE Latin1_General_100_CI_AS_SC NOT NULL,
    [description] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [active] BIT NOT NULL CONSTRAINT [Collection_active_df] DEFAULT 1,
    [position] INT NOT NULL CONSTRAINT [Collection_position_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Collection_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Collection_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Collection_slug_key] UNIQUE NONCLUSTERED ([slug])
);

-- CreateTable
CREATE TABLE [dbo].[ProductCollection] (
    [productId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [collectionId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [position] INT NOT NULL CONSTRAINT [ProductCollection_position_df] DEFAULT 0,
    CONSTRAINT [ProductCollection_pkey] PRIMARY KEY CLUSTERED ([productId],[collectionId])
);

-- CreateTable
CREATE TABLE [dbo].[ProductImage] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [productId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [url] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [alt] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [position] INT NOT NULL CONSTRAINT [ProductImage_position_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ProductImage_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ProductImage_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ProductVariant] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [productId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [sku] NVARCHAR(191) COLLATE Latin1_General_100_CI_AS_SC NOT NULL,
    [size] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [color] NVARCHAR(191) COLLATE Latin1_General_100_CI_AS_SC NOT NULL,
    [colorHex] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [mrpPaise] INT NOT NULL,
    [pricePaise] INT NOT NULL,
    [active] BIT NOT NULL CONSTRAINT [ProductVariant_active_df] DEFAULT 1,
    [weightGrams] INT,
    [bustMm] INT,
    [waistMm] INT,
    [hipMm] INT,
    [shoulderMm] INT,
    [sleeveLengthMm] INT,
    [garmentLengthMm] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ProductVariant_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ProductVariant_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ProductVariant_sku_key] UNIQUE NONCLUSTERED ([sku]),
    CONSTRAINT [ProductVariant_productId_size_color_key] UNIQUE NONCLUSTERED ([productId],[size],[color])
);

-- CreateTable
CREATE TABLE [dbo].[AdminStaff] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [authSubject] NVARCHAR(191) COLLATE Latin1_General_100_BIN2,
    [email] NVARCHAR(254) COLLATE Latin1_General_100_CI_AS_SC NOT NULL,
    [displayName] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [role] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [active] BIT NOT NULL CONSTRAINT [AdminStaff_active_df] DEFAULT 1,
    [lastLoginAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AdminStaff_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [AdminStaff_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [AdminStaff_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[AdminMediaUploadTicket] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [tokenHash] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [variantId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [mimeType] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [maxBytes] INT NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    [usedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AdminMediaUploadTicket_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AdminMediaUploadTicket_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [AdminMediaUploadTicket_tokenHash_key] UNIQUE NONCLUSTERED ([tokenHash])
);

-- CreateTable
CREATE TABLE [dbo].[ProductVariantImage] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [variantId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [url] NVARCHAR(512) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [storagePath] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [alt] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [position] INT NOT NULL CONSTRAINT [ProductVariantImage_position_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ProductVariantImage_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ProductVariantImage_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ProductVariantImage_variantId_url_key] UNIQUE NONCLUSTERED ([variantId],[url])
);

-- CreateTable
CREATE TABLE [dbo].[Inventory] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [variantId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [onHand] INT NOT NULL CONSTRAINT [Inventory_onHand_df] DEFAULT 0,
    [reserved] INT NOT NULL CONSTRAINT [Inventory_reserved_df] DEFAULT 0,
    [safetyStock] INT NOT NULL CONSTRAINT [Inventory_safetyStock_df] DEFAULT 0,
    [reorderLevel] INT NOT NULL CONSTRAINT [Inventory_reorderLevel_df] DEFAULT 5,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Inventory_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Inventory_variantId_key] UNIQUE NONCLUSTERED ([variantId])
);

-- CreateTable
CREATE TABLE [dbo].[InventoryMovement] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [inventoryId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [type] NVARCHAR(40) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [delta] INT NOT NULL,
    [onHandBefore] INT NOT NULL,
    [onHandAfter] INT NOT NULL,
    [reason] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [note] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [reference] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [actor] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [InventoryMovement_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [InventoryMovement_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[StockReceipt] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [receiptNumber] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [supplierName] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [invoiceNumber] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [purchaseOrderNumber] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [receivedAt] DATETIME2 NOT NULL,
    [status] NVARCHAR(40) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [StockReceipt_status_df] DEFAULT 'DRAFT',
    [note] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [totalAccepted] INT NOT NULL CONSTRAINT [StockReceipt_totalAccepted_df] DEFAULT 0,
    [totalRejected] INT NOT NULL CONSTRAINT [StockReceipt_totalRejected_df] DEFAULT 0,
    [createdBy] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [postedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [StockReceipt_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [StockReceipt_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [StockReceipt_receiptNumber_key] UNIQUE NONCLUSTERED ([receiptNumber])
);

-- CreateTable
CREATE TABLE [dbo].[StockReceiptLine] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [receiptId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [variantId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [acceptedQuantity] INT NOT NULL,
    [rejectedQuantity] INT NOT NULL CONSTRAINT [StockReceiptLine_rejectedQuantity_df] DEFAULT 0,
    [unitCostPaise] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [StockReceiptLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [StockReceiptLine_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [StockReceiptLine_receiptId_variantId_key] UNIQUE NONCLUSTERED ([receiptId],[variantId])
);

-- CreateTable
CREATE TABLE [dbo].[Cart] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [userId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2,
    [sessionId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2,
    [currency] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [Cart_currency_df] DEFAULT 'INR',
    [expiresAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Cart_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Cart_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[CartItem] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [cartId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [productId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [variantId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [quantity] INT NOT NULL CONSTRAINT [CartItem_quantity_df] DEFAULT 1,
    [unitPricePaise] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CartItem_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [CartItem_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CartItem_cartId_variantId_key] UNIQUE NONCLUSTERED ([cartId],[variantId])
);

-- CreateTable
CREATE TABLE [dbo].[Order] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [orderNumber] NVARCHAR(191) COLLATE Latin1_General_100_CI_AS_SC NOT NULL,
    [userId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2,
    [status] NVARCHAR(40) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [Order_status_df] DEFAULT 'PENDING_PAYMENT',
    [currency] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [Order_currency_df] DEFAULT 'INR',
    [subtotalPaise] INT NOT NULL,
    [discountPaise] INT NOT NULL CONSTRAINT [Order_discountPaise_df] DEFAULT 0,
    [shippingPaise] INT NOT NULL CONSTRAINT [Order_shippingPaise_df] DEFAULT 0,
    [taxPaise] INT NOT NULL CONSTRAINT [Order_taxPaise_df] DEFAULT 0,
    [totalPaise] INT NOT NULL,
    [walletAppliedPaise] INT NOT NULL CONSTRAINT [Order_walletAppliedPaise_df] DEFAULT 0,
    [customerEmail] NVARCHAR(254) COLLATE Latin1_General_100_CI_AS_SC,
    [customerPhone] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [shippingAddress] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [billingAddress] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [notes] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [checkoutToken] NVARCHAR(191) COLLATE Latin1_General_100_BIN2,
    [cartSessionId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Order_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Order_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Order_orderNumber_key] UNIQUE NONCLUSTERED ([orderNumber])
);

-- CreateTable
CREATE TABLE [dbo].[OrderAuditEvent] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [orderId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [eventType] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [actorType] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [actorId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2,
    [entityType] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [entityId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2,
    [fromStatus] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [toStatus] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [amountPaise] INT,
    [eventKey] NVARCHAR(191) COLLATE Latin1_General_100_BIN2,
    [correlationId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2,
    [source] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [metadata] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [OrderAuditEvent_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [OrderAuditEvent_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ReviewFollowUp] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [orderId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [channel] NVARCHAR(40) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [ReviewFollowUp_channel_df] DEFAULT 'EMAIL',
    [status] NVARCHAR(40) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [ReviewFollowUp_status_df] DEFAULT 'PENDING',
    [dueAt] DATETIME2 NOT NULL,
    [sentAt] DATETIME2,
    [attempts] INT NOT NULL CONSTRAINT [ReviewFollowUp_attempts_df] DEFAULT 0,
    [lastAttemptAt] DATETIME2,
    [lastError] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [providerMessageId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2,
    [reviewToken] NVARCHAR(191) COLLATE Latin1_General_100_BIN2,
    [completedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ReviewFollowUp_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ReviewFollowUp_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ReviewFollowUp_orderId_channel_key] UNIQUE NONCLUSTERED ([orderId],[channel])
);

-- CreateTable
CREATE TABLE [dbo].[ProductReview] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [productId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [orderId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [orderItemId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [rating] INT NOT NULL,
    [title] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [body] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [reviewerName] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [verifiedPurchase] BIT NOT NULL CONSTRAINT [ProductReview_verifiedPurchase_df] DEFAULT 1,
    [published] BIT NOT NULL CONSTRAINT [ProductReview_published_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ProductReview_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ProductReview_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ProductReview_orderItemId_key] UNIQUE NONCLUSTERED ([orderItemId])
);

-- CreateTable
CREATE TABLE [dbo].[OrderItem] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [orderId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [productId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [variantId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [productName] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [sku] NVARCHAR(max) COLLATE Latin1_General_100_CI_AS_SC NOT NULL,
    [size] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [color] NVARCHAR(max) COLLATE Latin1_General_100_CI_AS_SC NOT NULL,
    [quantity] INT NOT NULL,
    [unitPricePaise] INT NOT NULL,
    [discountPaise] INT NOT NULL CONSTRAINT [OrderItem_discountPaise_df] DEFAULT 0,
    [totalPaise] INT NOT NULL,
    CONSTRAINT [OrderItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[InventoryReservation] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [orderId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [variantId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [quantity] INT NOT NULL,
    [status] NVARCHAR(40) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [InventoryReservation_status_df] DEFAULT 'ACTIVE',
    [expiresAt] DATETIME2 NOT NULL,
    [consumedAt] DATETIME2,
    [releasedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [InventoryReservation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [InventoryReservation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [InventoryReservation_orderId_variantId_key] UNIQUE NONCLUSTERED ([orderId],[variantId])
);

-- CreateTable
CREATE TABLE [dbo].[Payment] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [orderId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [provider] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [Payment_provider_df] DEFAULT 'RAZORPAY',
    [providerOrderId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2,
    [providerPaymentId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2,
    [status] NVARCHAR(40) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [Payment_status_df] DEFAULT 'CREATED',
    [amountPaise] INT NOT NULL,
    [method] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [rawReference] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Payment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Payment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Shipment] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [orderId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [provider] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [providerOrderId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2,
    [awb] NVARCHAR(191) COLLATE Latin1_General_100_BIN2,
    [trackingUrl] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [status] NVARCHAR(40) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [Shipment_status_df] DEFAULT 'PENDING',
    [shippedAt] DATETIME2,
    [deliveredAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Shipment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Shipment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Coupon] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [code] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [active] BIT NOT NULL CONSTRAINT [Coupon_active_df] DEFAULT 1,
    [discountType] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [discountValue] INT NOT NULL,
    [minOrderPaise] INT NOT NULL CONSTRAINT [Coupon_minOrderPaise_df] DEFAULT 0,
    [maxDiscountPaise] INT,
    [startsAt] DATETIME2,
    [endsAt] DATETIME2,
    [maxUses] INT,
    [perUserLimit] INT NOT NULL CONSTRAINT [Coupon_perUserLimit_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Coupon_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Coupon_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Coupon_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[CouponRedemption] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [couponId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [userId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [orderId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CouponRedemption_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [CouponRedemption_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CouponRedemption_couponId_userId_orderId_key] UNIQUE NONCLUSTERED ([couponId],[userId],[orderId])
);

-- CreateTable
CREATE TABLE [dbo].[RetentionProfile] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [authSubject] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [userId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [whatsappOptIn] BIT NOT NULL CONSTRAINT [RetentionProfile_whatsappOptIn_df] DEFAULT 0,
    [personalizationOptIn] BIT NOT NULL CONSTRAINT [RetentionProfile_personalizationOptIn_df] DEFAULT 0,
    [consentVersion] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [RetentionProfile_consentVersion_df] DEFAULT 'hidi-retention-v1',
    [verifiedPhone] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [phoneVerifiedAt] DATETIME2,
    [consentUpdatedAt] DATETIME2 NOT NULL CONSTRAINT [RetentionProfile_consentUpdatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RetentionProfile_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [RetentionProfile_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [RetentionProfile_authSubject_key] UNIQUE NONCLUSTERED ([authSubject]),
    CONSTRAINT [RetentionProfile_userId_key] UNIQUE NONCLUSTERED ([userId])
);

-- CreateTable
CREATE TABLE [dbo].[RetentionConsentAudit] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [profileId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [whatsappOptIn] BIT NOT NULL,
    [personalizationOptIn] BIT NOT NULL,
    [consentVersion] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [source] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [verifiedPhone] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RetentionConsentAudit_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [RetentionConsentAudit_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[RetentionEvent] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [profileId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [productId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [variantId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2,
    [kind] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [episodeKey] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RetentionEvent_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [RetentionEvent_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[RetentionDelivery] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [profileId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [episodeKey] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [kind] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [category] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [RetentionDelivery_category_df] DEFAULT 'MARKETING',
    [status] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [sentAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RetentionDelivery_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [RetentionDelivery_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [RetentionDelivery_episodeKey_key] UNIQUE NONCLUSTERED ([episodeKey])
);

-- CreateTable
CREATE TABLE [dbo].[WalletAccount] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [authSubject] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [userId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [currency] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [WalletAccount_currency_df] DEFAULT 'INR',
    [balancePaise] INT NOT NULL CONSTRAINT [WalletAccount_balancePaise_df] DEFAULT 0,
    [reservedPaise] INT NOT NULL CONSTRAINT [WalletAccount_reservedPaise_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [WalletAccount_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [WalletAccount_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [WalletAccount_authSubject_key] UNIQUE NONCLUSTERED ([authSubject]),
    CONSTRAINT [WalletAccount_userId_key] UNIQUE NONCLUSTERED ([userId])
);

-- CreateTable
CREATE TABLE [dbo].[WalletLedger] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [walletId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [orderId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2,
    [kind] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [deltaPaise] INT NOT NULL,
    [eventKey] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [WalletLedger_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [WalletLedger_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [WalletLedger_eventKey_key] UNIQUE NONCLUSTERED ([eventKey])
);

-- CreateTable
CREATE TABLE [dbo].[WalletHold] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [walletId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [orderId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [amountPaise] INT NOT NULL,
    [status] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [WalletHold_status_df] DEFAULT 'ACTIVE',
    [expiresAt] DATETIME2 NOT NULL,
    [consumedAt] DATETIME2,
    [releasedAt] DATETIME2,
    [refundedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [WalletHold_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [WalletHold_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [WalletHold_orderId_key] UNIQUE NONCLUSTERED ([orderId])
);

-- CreateTable
CREATE TABLE [dbo].[RewardAccrual] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [walletId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [orderId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [basisPaise] INT NOT NULL,
    [rewardPaise] INT NOT NULL,
    [returnWindowDays] INT NOT NULL,
    [policyVersion] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [status] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [RewardAccrual_status_df] DEFAULT 'PENDING',
    [eligibleAt] DATETIME2,
    [creditedAt] DATETIME2,
    [reversedAt] DATETIME2,
    [reason] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RewardAccrual_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [RewardAccrual_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [RewardAccrual_orderId_key] UNIQUE NONCLUSTERED ([orderId])
);

-- CreateTable
CREATE TABLE [dbo].[PaymentRefund] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [paymentId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [providerRefundId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [amountPaise] INT NOT NULL,
    [status] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [PaymentRefund_status_df] DEFAULT 'PROCESSED',
    [processedAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PaymentRefund_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PaymentRefund_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PaymentRefund_providerRefundId_key] UNIQUE NONCLUSTERED ([providerRefundId])
);

-- CreateTable
CREATE TABLE [dbo].[WhatsAppConversation] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [phone] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [state] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [WhatsAppConversation_state_df] DEFAULT 'IDLE',
    [context] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [lastInboundAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [WhatsAppConversation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [WhatsAppConversation_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [WhatsAppConversation_phone_key] UNIQUE NONCLUSTERED ([phone])
);

-- CreateTable
CREATE TABLE [dbo].[WhatsAppMessage] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [conversationId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [providerMessageSid] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [direction] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [body] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [status] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [WhatsAppMessage_status_df] DEFAULT 'RECEIVED',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [WhatsAppMessage_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [WhatsAppMessage_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [WhatsAppMessage_providerMessageSid_key] UNIQUE NONCLUSTERED ([providerMessageSid])
);

-- CreateTable
CREATE TABLE [dbo].[NewsletterSubscriber] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [email] NVARCHAR(254) COLLATE Latin1_General_100_CI_AS_SC NOT NULL,
    [status] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [NewsletterSubscriber_status_df] DEFAULT 'ACTIVE',
    [source] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [NewsletterSubscriber_source_df] DEFAULT 'FOOTER',
    [consentVersion] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [NewsletterSubscriber_consentVersion_df] DEFAULT 'hidi-newsletter-v1',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [NewsletterSubscriber_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [NewsletterSubscriber_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [NewsletterSubscriber_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[ReturnRequest] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [orderId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [orderItemId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [type] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [reason] NVARCHAR(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [detail] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [quantity] INT NOT NULL CONSTRAINT [ReturnRequest_quantity_df] DEFAULT 1,
    [refundDestination] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [requestedVariantId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2,
    [requestedSize] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [refundPaise] INT NOT NULL CONSTRAINT [ReturnRequest_refundPaise_df] DEFAULT 0,
    [status] NVARCHAR(191) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT [ReturnRequest_status_df] DEFAULT 'REQUESTED',
    [adminNote] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [rejectionReason] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [pickupProvider] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [pickupAwb] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [pickupTrackingUrl] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [pickupScheduledAt] DATETIME2,
    [receivedAt] DATETIME2,
    [inventoryDisposition] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [refundWalletPaise] INT NOT NULL CONSTRAINT [ReturnRequest_refundWalletPaise_df] DEFAULT 0,
    [refundCashPaise] INT NOT NULL CONSTRAINT [ReturnRequest_refundCashPaise_df] DEFAULT 0,
    [refundStatus] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [refundProviderId] NVARCHAR(64) COLLATE Latin1_General_100_BIN2,
    [replacementProvider] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [replacementAwb] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [replacementTrackingUrl] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [replacementShippedAt] DATETIME2,
    [exchangeReservationStatus] NVARCHAR(max) COLLATE Latin1_General_100_BIN2,
    [exchangeReservedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ReturnRequest_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [approvedAt] DATETIME2,
    [processedAt] DATETIME2,
    [completedAt] DATETIME2,
    CONSTRAINT [ReturnRequest_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[BackgroundLease] (
    [id] NVARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    [owner] NVARCHAR(64) COLLATE Latin1_General_100_BIN2,
    [expiresAt] DATETIME2 NOT NULL,
    CONSTRAINT [BackgroundLease_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [User_createdAt_idx] ON [dbo].[User]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Address_userId_idx] ON [dbo].[Address]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Address_postalCode_idx] ON [dbo].[Address]([postalCode]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Product_status_featuredRank_idx] ON [dbo].[Product]([status], [featuredRank]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Product_categoryId_status_idx] ON [dbo].[Product]([categoryId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ProductCollection_collectionId_position_idx] ON [dbo].[ProductCollection]([collectionId], [position]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ProductImage_productId_position_idx] ON [dbo].[ProductImage]([productId], [position]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ProductVariant_productId_active_idx] ON [dbo].[ProductVariant]([productId], [active]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AdminStaff_role_active_idx] ON [dbo].[AdminStaff]([role], [active]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AdminMediaUploadTicket_variantId_expiresAt_idx] ON [dbo].[AdminMediaUploadTicket]([variantId], [expiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AdminMediaUploadTicket_expiresAt_usedAt_idx] ON [dbo].[AdminMediaUploadTicket]([expiresAt], [usedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ProductVariantImage_variantId_position_idx] ON [dbo].[ProductVariantImage]([variantId], [position]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryMovement_inventoryId_createdAt_idx] ON [dbo].[InventoryMovement]([inventoryId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryMovement_createdAt_idx] ON [dbo].[InventoryMovement]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StockReceipt_status_createdAt_idx] ON [dbo].[StockReceipt]([status], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StockReceipt_receivedAt_idx] ON [dbo].[StockReceipt]([receivedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StockReceiptLine_variantId_idx] ON [dbo].[StockReceiptLine]([variantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Cart_userId_idx] ON [dbo].[Cart]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CartItem_cartId_idx] ON [dbo].[CartItem]([cartId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CartItem_productId_idx] ON [dbo].[CartItem]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CartItem_variantId_idx] ON [dbo].[CartItem]([variantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Order_userId_createdAt_idx] ON [dbo].[Order]([userId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Order_status_createdAt_idx] ON [dbo].[Order]([status], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Order_customerPhone_idx] ON [dbo].[Order]([customerPhone]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Order_cartSessionId_idx] ON [dbo].[Order]([cartSessionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OrderAuditEvent_orderId_createdAt_id_idx] ON [dbo].[OrderAuditEvent]([orderId], [createdAt], [id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OrderAuditEvent_eventType_createdAt_idx] ON [dbo].[OrderAuditEvent]([eventType], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OrderAuditEvent_correlationId_idx] ON [dbo].[OrderAuditEvent]([correlationId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ReviewFollowUp_status_dueAt_idx] ON [dbo].[ReviewFollowUp]([status], [dueAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ReviewFollowUp_orderId_idx] ON [dbo].[ReviewFollowUp]([orderId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ProductReview_productId_published_createdAt_idx] ON [dbo].[ProductReview]([productId], [published], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ProductReview_orderId_idx] ON [dbo].[ProductReview]([orderId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OrderItem_orderId_idx] ON [dbo].[OrderItem]([orderId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OrderItem_variantId_idx] ON [dbo].[OrderItem]([variantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OrderItem_productId_idx] ON [dbo].[OrderItem]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryReservation_status_expiresAt_idx] ON [dbo].[InventoryReservation]([status], [expiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryReservation_variantId_status_idx] ON [dbo].[InventoryReservation]([variantId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Payment_orderId_status_idx] ON [dbo].[Payment]([orderId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Payment_providerOrderId_idx] ON [dbo].[Payment]([providerOrderId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Shipment_orderId_status_idx] ON [dbo].[Shipment]([orderId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CouponRedemption_couponId_userId_idx] ON [dbo].[CouponRedemption]([couponId], [userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CouponRedemption_userId_idx] ON [dbo].[CouponRedemption]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RetentionConsentAudit_profileId_createdAt_idx] ON [dbo].[RetentionConsentAudit]([profileId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RetentionEvent_profileId_productId_createdAt_idx] ON [dbo].[RetentionEvent]([profileId], [productId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RetentionEvent_createdAt_idx] ON [dbo].[RetentionEvent]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RetentionDelivery_profileId_category_sentAt_idx] ON [dbo].[RetentionDelivery]([profileId], [category], [sentAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WalletLedger_walletId_createdAt_id_idx] ON [dbo].[WalletLedger]([walletId], [createdAt], [id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WalletLedger_orderId_idx] ON [dbo].[WalletLedger]([orderId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WalletHold_walletId_status_idx] ON [dbo].[WalletHold]([walletId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WalletHold_status_expiresAt_idx] ON [dbo].[WalletHold]([status], [expiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RewardAccrual_walletId_status_idx] ON [dbo].[RewardAccrual]([walletId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RewardAccrual_status_eligibleAt_id_idx] ON [dbo].[RewardAccrual]([status], [eligibleAt], [id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RewardAccrual_createdAt_id_idx] ON [dbo].[RewardAccrual]([createdAt], [id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PaymentRefund_paymentId_status_idx] ON [dbo].[PaymentRefund]([paymentId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WhatsAppConversation_state_updatedAt_idx] ON [dbo].[WhatsAppConversation]([state], [updatedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WhatsAppMessage_conversationId_createdAt_idx] ON [dbo].[WhatsAppMessage]([conversationId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [NewsletterSubscriber_status_createdAt_idx] ON [dbo].[NewsletterSubscriber]([status], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ReturnRequest_orderId_status_createdAt_idx] ON [dbo].[ReturnRequest]([orderId], [status], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ReturnRequest_orderItemId_status_idx] ON [dbo].[ReturnRequest]([orderItemId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ReturnRequest_status_updatedAt_idx] ON [dbo].[ReturnRequest]([status], [updatedAt]);

-- AddForeignKey
ALTER TABLE [dbo].[Address] ADD CONSTRAINT [Address_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Product] ADD CONSTRAINT [Product_categoryId_fkey] FOREIGN KEY ([categoryId]) REFERENCES [dbo].[Category]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ProductCollection] ADD CONSTRAINT [ProductCollection_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[Product]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ProductCollection] ADD CONSTRAINT [ProductCollection_collectionId_fkey] FOREIGN KEY ([collectionId]) REFERENCES [dbo].[Collection]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ProductImage] ADD CONSTRAINT [ProductImage_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[Product]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ProductVariant] ADD CONSTRAINT [ProductVariant_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[Product]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AdminMediaUploadTicket] ADD CONSTRAINT [AdminMediaUploadTicket_variantId_fkey] FOREIGN KEY ([variantId]) REFERENCES [dbo].[ProductVariant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ProductVariantImage] ADD CONSTRAINT [ProductVariantImage_variantId_fkey] FOREIGN KEY ([variantId]) REFERENCES [dbo].[ProductVariant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Inventory] ADD CONSTRAINT [Inventory_variantId_fkey] FOREIGN KEY ([variantId]) REFERENCES [dbo].[ProductVariant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[InventoryMovement] ADD CONSTRAINT [InventoryMovement_inventoryId_fkey] FOREIGN KEY ([inventoryId]) REFERENCES [dbo].[Inventory]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StockReceiptLine] ADD CONSTRAINT [StockReceiptLine_receiptId_fkey] FOREIGN KEY ([receiptId]) REFERENCES [dbo].[StockReceipt]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StockReceiptLine] ADD CONSTRAINT [StockReceiptLine_variantId_fkey] FOREIGN KEY ([variantId]) REFERENCES [dbo].[ProductVariant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Cart] ADD CONSTRAINT [Cart_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CartItem] ADD CONSTRAINT [CartItem_cartId_fkey] FOREIGN KEY ([cartId]) REFERENCES [dbo].[Cart]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CartItem] ADD CONSTRAINT [CartItem_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[Product]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CartItem] ADD CONSTRAINT [CartItem_variantId_fkey] FOREIGN KEY ([variantId]) REFERENCES [dbo].[ProductVariant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Order] ADD CONSTRAINT [Order_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[OrderAuditEvent] ADD CONSTRAINT [OrderAuditEvent_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[Order]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ReviewFollowUp] ADD CONSTRAINT [ReviewFollowUp_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[Order]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ProductReview] ADD CONSTRAINT [ProductReview_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[Product]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ProductReview] ADD CONSTRAINT [ProductReview_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[Order]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ProductReview] ADD CONSTRAINT [ProductReview_orderItemId_fkey] FOREIGN KEY ([orderItemId]) REFERENCES [dbo].[OrderItem]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[OrderItem] ADD CONSTRAINT [OrderItem_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[Order]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[OrderItem] ADD CONSTRAINT [OrderItem_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[Product]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[OrderItem] ADD CONSTRAINT [OrderItem_variantId_fkey] FOREIGN KEY ([variantId]) REFERENCES [dbo].[ProductVariant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[InventoryReservation] ADD CONSTRAINT [InventoryReservation_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[Order]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[InventoryReservation] ADD CONSTRAINT [InventoryReservation_variantId_fkey] FOREIGN KEY ([variantId]) REFERENCES [dbo].[ProductVariant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Payment] ADD CONSTRAINT [Payment_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[Order]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Shipment] ADD CONSTRAINT [Shipment_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[Order]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CouponRedemption] ADD CONSTRAINT [CouponRedemption_couponId_fkey] FOREIGN KEY ([couponId]) REFERENCES [dbo].[Coupon]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CouponRedemption] ADD CONSTRAINT [CouponRedemption_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RetentionProfile] ADD CONSTRAINT [RetentionProfile_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RetentionConsentAudit] ADD CONSTRAINT [RetentionConsentAudit_profileId_fkey] FOREIGN KEY ([profileId]) REFERENCES [dbo].[RetentionProfile]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RetentionEvent] ADD CONSTRAINT [RetentionEvent_profileId_fkey] FOREIGN KEY ([profileId]) REFERENCES [dbo].[RetentionProfile]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RetentionDelivery] ADD CONSTRAINT [RetentionDelivery_profileId_fkey] FOREIGN KEY ([profileId]) REFERENCES [dbo].[RetentionProfile]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WalletAccount] ADD CONSTRAINT [WalletAccount_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WalletLedger] ADD CONSTRAINT [WalletLedger_walletId_fkey] FOREIGN KEY ([walletId]) REFERENCES [dbo].[WalletAccount]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WalletLedger] ADD CONSTRAINT [WalletLedger_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[Order]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WalletHold] ADD CONSTRAINT [WalletHold_walletId_fkey] FOREIGN KEY ([walletId]) REFERENCES [dbo].[WalletAccount]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WalletHold] ADD CONSTRAINT [WalletHold_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[Order]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RewardAccrual] ADD CONSTRAINT [RewardAccrual_walletId_fkey] FOREIGN KEY ([walletId]) REFERENCES [dbo].[WalletAccount]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RewardAccrual] ADD CONSTRAINT [RewardAccrual_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[Order]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PaymentRefund] ADD CONSTRAINT [PaymentRefund_paymentId_fkey] FOREIGN KEY ([paymentId]) REFERENCES [dbo].[Payment]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[WhatsAppMessage] ADD CONSTRAINT [WhatsAppMessage_conversationId_fkey] FOREIGN KEY ([conversationId]) REFERENCES [dbo].[WhatsAppConversation]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ReturnRequest] ADD CONSTRAINT [ReturnRequest_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[Order]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ReturnRequest] ADD CONSTRAINT [ReturnRequest_orderItemId_fkey] FOREIGN KEY ([orderItemId]) REFERENCES [dbo].[OrderItem]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Preserve PostgreSQL business constraints and nullable uniqueness.
CREATE UNIQUE INDEX [User_email_key] ON [dbo].[User] ([email]) WHERE [email] IS NOT NULL;
CREATE UNIQUE INDEX [User_phone_key] ON [dbo].[User] ([phone]) WHERE [phone] IS NOT NULL;
CREATE UNIQUE INDEX [AdminStaff_authSubject_key] ON [dbo].[AdminStaff] ([authSubject]) WHERE [authSubject] IS NOT NULL;
CREATE UNIQUE INDEX [Cart_sessionId_key] ON [dbo].[Cart] ([sessionId]) WHERE [sessionId] IS NOT NULL;
CREATE UNIQUE INDEX [Order_checkoutToken_key] ON [dbo].[Order] ([checkoutToken]) WHERE [checkoutToken] IS NOT NULL;
CREATE UNIQUE INDEX [OrderAuditEvent_eventKey_key] ON [dbo].[OrderAuditEvent] ([eventKey]) WHERE [eventKey] IS NOT NULL;
CREATE UNIQUE INDEX [ReviewFollowUp_reviewToken_key] ON [dbo].[ReviewFollowUp] ([reviewToken]) WHERE [reviewToken] IS NOT NULL;
CREATE UNIQUE INDEX [Payment_providerPaymentId_key] ON [dbo].[Payment] ([providerPaymentId]) WHERE [providerPaymentId] IS NOT NULL;
CREATE UNIQUE INDEX [Shipment_awb_key] ON [dbo].[Shipment] ([awb]) WHERE [awb] IS NOT NULL;
CREATE UNIQUE INDEX [ReturnRequest_refundProviderId_key] ON [dbo].[ReturnRequest] ([refundProviderId]) WHERE [refundProviderId] IS NOT NULL;
ALTER TABLE [dbo].[User] ADD CONSTRAINT [User_role_values] CHECK ([role] IN ('CUSTOMER','ADMIN','OPERATIONS','SUPPORT'));
ALTER TABLE [dbo].[Product] ADD CONSTRAINT [Product_status_values] CHECK ([status] IN ('DRAFT','ACTIVE','ARCHIVED'));
ALTER TABLE [dbo].[InventoryMovement] ADD CONSTRAINT [InventoryMovement_type_values] CHECK ([type] IN ('RECEIPT','CORRECTION','DAMAGE','RETURN_RESTOCK','OTHER'));
ALTER TABLE [dbo].[StockReceipt] ADD CONSTRAINT [StockReceipt_status_values] CHECK ([status] IN ('DRAFT','POSTED','CANCELLED'));
ALTER TABLE [dbo].[Order] ADD CONSTRAINT [Order_status_values] CHECK ([status] IN ('PENDING_PAYMENT','CONFIRMED','PACKED','SHIPPED','DELIVERED','CANCELLED','RETURN_REQUESTED','RETURNED','REFUNDED','PAYMENT_REVIEW'));
ALTER TABLE [dbo].[Order] ADD CONSTRAINT [Order_shippingAddress_json] CHECK ([shippingAddress] IS NULL OR ISJSON([shippingAddress], VALUE) = 1);
ALTER TABLE [dbo].[Order] ADD CONSTRAINT [Order_billingAddress_json] CHECK ([billingAddress] IS NULL OR ISJSON([billingAddress], VALUE) = 1);
ALTER TABLE [dbo].[OrderAuditEvent] ADD CONSTRAINT [OrderAuditEvent_metadata_json] CHECK ([metadata] IS NULL OR ISJSON([metadata], VALUE) = 1);
ALTER TABLE [dbo].[ReviewFollowUp] ADD CONSTRAINT [ReviewFollowUp_channel_values] CHECK ([channel] IN ('EMAIL'));
ALTER TABLE [dbo].[ReviewFollowUp] ADD CONSTRAINT [ReviewFollowUp_status_values] CHECK ([status] IN ('PENDING','SENT','FAILED','CANCELLED'));
ALTER TABLE [dbo].[InventoryReservation] ADD CONSTRAINT [InventoryReservation_status_values] CHECK ([status] IN ('ACTIVE','CONSUMED','RELEASED'));
ALTER TABLE [dbo].[Payment] ADD CONSTRAINT [Payment_status_values] CHECK ([status] IN ('CREATED','AUTHORIZED','CAPTURED','FAILED','REFUNDED','PARTIALLY_REFUNDED'));
ALTER TABLE [dbo].[Payment] ADD CONSTRAINT [Payment_rawReference_json] CHECK ([rawReference] IS NULL OR ISJSON([rawReference], VALUE) = 1);
ALTER TABLE [dbo].[Shipment] ADD CONSTRAINT [Shipment_status_values] CHECK ([status] IN ('PENDING','READY_TO_SHIP','SHIPPED','OUT_FOR_DELIVERY','DELIVERED','RTO','CANCELLED'));
ALTER TABLE [dbo].[WhatsAppConversation] ADD CONSTRAINT [WhatsAppConversation_context_json] CHECK ([context] IS NULL OR ISJSON([context], VALUE) = 1);
ALTER TABLE [dbo].[WalletAccount] ADD CONSTRAINT [WalletAccount_funds_check] CHECK ([reservedPaise] >= 0 AND [currency] = 'INR');
ALTER TABLE [dbo].[Order] ADD CONSTRAINT [Order_wallet_amount_check] CHECK ([walletAppliedPaise] >= 0 AND [walletAppliedPaise] <= [totalPaise]);
ALTER TABLE [dbo].[WalletLedger] ADD CONSTRAINT [WalletLedger_entry_check] CHECK (([kind] IN ('EARN','REFUND_REDEEM','RETURN_REFUND') AND [deltaPaise] > 0) OR ([kind] IN ('REDEEM','REVERSE_EARN') AND [deltaPaise] < 0));
ALTER TABLE [dbo].[WalletHold] ADD CONSTRAINT [WalletHold_state_check] CHECK ([amountPaise] > 0 AND [status] IN ('ACTIVE','CONSUMED','RELEASED','REFUNDED'));
ALTER TABLE [dbo].[RewardAccrual] ADD CONSTRAINT [RewardAccrual_policy_check] CHECK ([basisPaise] >= 0 AND [rewardPaise] >= 0 AND [returnWindowDays] BETWEEN 1 AND 365 AND [status] IN ('PENDING','HELD','CREDITED','REVERSED'));
ALTER TABLE [dbo].[PaymentRefund] ADD CONSTRAINT [PaymentRefund_amount_check] CHECK ([amountPaise] >= 0 AND [status] = 'PROCESSED');
ALTER TABLE [dbo].[AdminStaff] ADD CONSTRAINT [AdminStaff_role_check] CHECK ([role] IN ('OWNER','OPERATIONS','SUPPORT','CATALOG'));
ALTER TABLE [dbo].[AdminStaff] ADD CONSTRAINT [AdminStaff_identity_check] CHECK (LEN(TRIM([email])) > 3 AND LEN(TRIM([displayName])) BETWEEN 2 AND 120);
ALTER TABLE [dbo].[OrderAuditEvent] ADD CONSTRAINT [OrderAuditEvent_amount_nonnegative] CHECK ([amountPaise] IS NULL OR [amountPaise] >= 0);
ALTER TABLE [dbo].[ProductVariant] ADD CONSTRAINT [ProductVariant_bustMm_check] CHECK ([bustMm] IS NULL OR [bustMm] BETWEEN 200 AND 3000);
ALTER TABLE [dbo].[ProductVariant] ADD CONSTRAINT [ProductVariant_waistMm_check] CHECK ([waistMm] IS NULL OR [waistMm] BETWEEN 200 AND 3000);
ALTER TABLE [dbo].[ProductVariant] ADD CONSTRAINT [ProductVariant_hipMm_check] CHECK ([hipMm] IS NULL OR [hipMm] BETWEEN 200 AND 3000);
ALTER TABLE [dbo].[ProductVariant] ADD CONSTRAINT [ProductVariant_shoulderMm_check] CHECK ([shoulderMm] IS NULL OR [shoulderMm] BETWEEN 100 AND 1000);
ALTER TABLE [dbo].[ProductVariant] ADD CONSTRAINT [ProductVariant_sleeveLengthMm_check] CHECK ([sleeveLengthMm] IS NULL OR [sleeveLengthMm] BETWEEN 50 AND 1500);
ALTER TABLE [dbo].[ProductVariant] ADD CONSTRAINT [ProductVariant_garmentLengthMm_check] CHECK ([garmentLengthMm] IS NULL OR [garmentLengthMm] BETWEEN 100 AND 2500);
EXEC(N'CREATE TRIGGER [dbo].[WalletLedger_immutable] ON [dbo].[WalletLedger] INSTEAD OF UPDATE, DELETE AS BEGIN SET NOCOUNT ON; THROW 51000, ''WalletLedger is append-only; record a compensating event instead'', 1; END');
EXEC(N'CREATE TRIGGER [dbo].[OrderAuditEvent_immutable] ON [dbo].[OrderAuditEvent] INSTEAD OF UPDATE, DELETE AS BEGIN SET NOCOUNT ON; THROW 51000, ''OrderAuditEvent is append-only; record a compensating event instead'', 1; END');
INSERT INTO [dbo].[BackgroundLease] ([id],[owner],[expiresAt]) VALUES ('review-followup',NULL,'2000-01-01T00:00:00');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

