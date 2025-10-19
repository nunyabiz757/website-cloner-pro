-- CreateTable
CREATE TABLE "ClonedPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceTitle" TEXT,
    "pageData" TEXT NOT NULL,
    "creditsConsumed" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'copied',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PasteSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clonedPageId" TEXT NOT NULL,
    "pasteCode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "destinationUrl" TEXT,
    "elementsCount" INTEGER,
    "errors" TEXT,
    "warnings" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PasteSession_clonedPageId_fkey" FOREIGN KEY ("clonedPageId") REFERENCES "ClonedPage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ClonedPage_userId_idx" ON "ClonedPage"("userId");

-- CreateIndex
CREATE INDEX "ClonedPage_status_idx" ON "ClonedPage"("status");

-- CreateIndex
CREATE INDEX "ClonedPage_createdAt_idx" ON "ClonedPage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasteSession_pasteCode_key" ON "PasteSession"("pasteCode");

-- CreateIndex
CREATE INDEX "PasteSession_clonedPageId_idx" ON "PasteSession"("clonedPageId");

-- CreateIndex
CREATE INDEX "PasteSession_pasteCode_idx" ON "PasteSession"("pasteCode");

-- CreateIndex
CREATE INDEX "PasteSession_userId_idx" ON "PasteSession"("userId");

-- CreateIndex
CREATE INDEX "PasteSession_status_idx" ON "PasteSession"("status");

-- CreateIndex
CREATE INDEX "PasteSession_expiresAt_idx" ON "PasteSession"("expiresAt");
