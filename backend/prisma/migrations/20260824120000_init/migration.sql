-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ApprovalState" AS ENUM ('REGISTERED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PartyRole" AS ENUM ('REQUESTER', 'APPROVER', 'PARTICIPANT');

-- CreateEnum
CREATE TYPE "DecisionOutcome" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "summary" TEXT,
    "department" TEXT,
    "project" TEXT,
    "state" "ApprovalState" NOT NULL DEFAULT 'REGISTERED',
    "threadId" TEXT NOT NULL,
    "messageId" TEXT,
    "gmailMessageId" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "PartyRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "decision" "DecisionOutcome" NOT NULL,
    "reason" TEXT,
    "decidedBy" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "approvalId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnprocessedMail" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "threadId" TEXT,
    "subject" TEXT,
    "fromAddress" TEXT,
    "snippet" TEXT,
    "reason" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "UnprocessedMail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedMessage" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "messageIdHeader" TEXT,
    "threadId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GmailSyncState" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "historyId" TEXT,
    "watchExpiry" TIMESTAMP(3),
    "lastReconcileAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GmailSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_threadId_key" ON "Approval"("threadId");

-- CreateIndex
CREATE INDEX "Approval_state_idx" ON "Approval"("state");

-- CreateIndex
CREATE INDEX "Approval_department_idx" ON "Approval"("department");

-- CreateIndex
CREATE INDEX "Approval_project_idx" ON "Approval"("project");

-- CreateIndex
CREATE INDEX "Approval_lastActivityAt_idx" ON "Approval"("lastActivityAt");

-- CreateIndex
CREATE INDEX "Approval_createdAt_idx" ON "Approval"("createdAt");

-- CreateIndex
CREATE INDEX "Party_email_idx" ON "Party"("email");

-- CreateIndex
CREATE INDEX "Party_role_idx" ON "Party"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Party_approvalId_email_role_key" ON "Party"("approvalId", "email", "role");

-- CreateIndex
CREATE INDEX "Decision_approvalId_idx" ON "Decision"("approvalId");

-- CreateIndex
CREATE INDEX "ActivityLog_approvalId_idx" ON "ActivityLog"("approvalId");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UnprocessedMail_gmailMessageId_key" ON "UnprocessedMail"("gmailMessageId");

-- CreateIndex
CREATE INDEX "UnprocessedMail_resolvedAt_idx" ON "UnprocessedMail"("resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedMessage_gmailMessageId_key" ON "ProcessedMessage"("gmailMessageId");

-- CreateIndex
CREATE INDEX "ProcessedMessage_threadId_idx" ON "ProcessedMessage"("threadId");

-- CreateIndex
CREATE INDEX "ProcessedMessage_messageIdHeader_idx" ON "ProcessedMessage"("messageIdHeader");

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE CASCADE ON UPDATE CASCADE;
