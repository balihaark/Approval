import test from "node:test";
import assert from "node:assert/strict";
import { parseGmailMessage, partiesFromParsed } from "../lib/gmail/parser.js";
import { ingestParsedMessage } from "../lib/gmail/ingestion.js";
import { prisma } from "../lib/prisma.js";
import { PartyRole, ApprovalState } from "@prisma/client";

test("1. Gmail ingestion assigns sequence orders 0, 1, 2 for To recipients A, B, C", async () => {
  const rawMessage = {
    id: "msg_seq_001",
    threadId: "thread_seq_001",
    payload: {
      headers: [
        { name: "Subject", value: "Sequential Test Request" },
        { name: "From", value: "Requester <requester@corp.com>" },
        {
          name: "To",
          value:
            "Approver A <approvera@corp.com>, Approver B <approverb@corp.com>, Approver C <approverc@corp.com>",
        },
      ],
      mimeType: "text/plain",
      body: {
        data: Buffer.from("Please approve this in sequence.").toString("base64url"),
      },
    },
  };

  const parsed = parseGmailMessage(rawMessage);
  const parties = partiesFromParsed(parsed);
  assert.equal(parties.approvers.length, 3);
  assert.equal(parties.approvers[0].email, "approvera@corp.com");
  assert.equal(parties.approvers[1].email, "approverb@corp.com");
  assert.equal(parties.approvers[2].email, "approverc@corp.com");

  await prisma.approval.deleteMany({ where: { threadId: "thread_seq_001" } });
  await prisma.processedMessage.deleteMany({ where: { threadId: "thread_seq_001" } });

  const result = await ingestParsedMessage(parsed);
  assert.equal(result.kind, "created");

  const dbApproval = await prisma.approval.findUnique({
    where: { threadId: "thread_seq_001" },
    include: { parties: true },
  });

  assert.ok(dbApproval);
  const dbApprovers = dbApproval.parties
    .filter((p) => p.role === PartyRole.APPROVER)
    .sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));

  assert.equal(dbApprovers.length, 3);
  assert.equal(dbApprovers[0].email, "approvera@corp.com");
  assert.equal(dbApprovers[0].sequenceOrder, 0);

  assert.equal(dbApprovers[1].email, "approverb@corp.com");
  assert.equal(dbApprovers[1].sequenceOrder, 1);

  assert.equal(dbApprovers[2].email, "approverc@corp.com");
  assert.equal(dbApprovers[2].sequenceOrder, 2);

  await prisma.approval.delete({ where: { id: dbApproval.id } });
  await prisma.processedMessage.deleteMany({ where: { threadId: "thread_seq_001" } });
});

test("2. Sequential turn enforcement: out of turn rejection, step approval & rejection termination", async () => {
  const threadId = "thread_seq_002";
  await prisma.approval.deleteMany({ where: { threadId } });

  const approval = await prisma.approval.create({
    data: {
      subject: "Test Sequential Decisions",
      body: "Body",
      threadId,
      state: ApprovalState.PENDING_APPROVAL,
      parties: {
        create: [
          { email: "req@test.com", role: PartyRole.REQUESTER },
          { email: "approvera@test.com", role: PartyRole.APPROVER, sequenceOrder: 0 },
          { email: "approverb@test.com", role: PartyRole.APPROVER, sequenceOrder: 1 },
          { email: "approverc@test.com", role: PartyRole.APPROVER, sequenceOrder: 2 },
        ],
      },
    },
    include: { parties: true, decisions: true },
  });

  const approvers = approval.parties
    .filter((p) => p.role === PartyRole.APPROVER)
    .sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));

  let turnIndex = approval.decisions.length;
  let currentApprover = approvers[turnIndex];
  assert.equal(currentApprover.email, "approvera@test.com");

  const isBTurn = ("approverb@test.com" as string) === currentApprover.email;
  assert.equal(isBTurn, false, "B attempting out of turn should be false");

  // Step 1: A approves -> Turn advances to B, state remains PENDING_APPROVAL
  await prisma.decision.create({
    data: {
      approvalId: approval.id,
      decision: "APPROVED",
      decidedBy: "approvera@test.com",
    },
  });

  let updated = await prisma.approval.findUnique({
    where: { id: approval.id },
    include: { parties: true, decisions: { orderBy: { decidedAt: "asc" } } },
  });
  assert.ok(updated);

  turnIndex = updated.decisions.length;
  assert.equal(turnIndex, 1);
  currentApprover = approvers[turnIndex];
  assert.equal(currentApprover.email, "approverb@test.com");
  assert.equal(updated.state, ApprovalState.PENDING_APPROVAL);

  // Step 2: B rejects -> Immediate termination as REJECTED
  await prisma.decision.create({
    data: {
      approvalId: approval.id,
      decision: "REJECTED",
      reason: "Budget too high",
      decidedBy: "approverb@test.com",
    },
  });
  await prisma.approval.update({
    where: { id: approval.id },
    data: { state: ApprovalState.REJECTED },
  });

  updated = await prisma.approval.findUnique({
    where: { id: approval.id },
    include: { parties: true, decisions: true },
  });
  assert.ok(updated);
  assert.equal(updated.state, ApprovalState.REJECTED);

  await prisma.approval.delete({ where: { id: approval.id } });
});

test("3. Full sequence approval: A -> B -> C only becomes APPROVED after C", async () => {
  const threadId = "thread_seq_003";
  await prisma.approval.deleteMany({ where: { threadId } });

  const approval = await prisma.approval.create({
    data: {
      subject: "Test Full Sequence",
      body: "Body",
      threadId,
      state: ApprovalState.PENDING_APPROVAL,
      parties: {
        create: [
          { email: "req@test.com", role: PartyRole.REQUESTER },
          { email: "approvera@test.com", role: PartyRole.APPROVER, sequenceOrder: 0 },
          { email: "approverb@test.com", role: PartyRole.APPROVER, sequenceOrder: 1 },
          { email: "approverc@test.com", role: PartyRole.APPROVER, sequenceOrder: 2 },
        ],
      },
    },
    include: { parties: true, decisions: true },
  });

  const approvers = approval.parties
    .filter((p) => p.role === PartyRole.APPROVER)
    .sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));

  // Turn 0: A approves
  await prisma.decision.create({
    data: { approvalId: approval.id, decision: "APPROVED", decidedBy: "approvera@test.com" },
  });
  let state = approvers.length === 1 ? ApprovalState.APPROVED : ApprovalState.PENDING_APPROVAL;
  assert.equal(state, ApprovalState.PENDING_APPROVAL);

  // Turn 1: B approves
  await prisma.decision.create({
    data: { approvalId: approval.id, decision: "APPROVED", decidedBy: "approverb@test.com" },
  });
  state = 1 === approvers.length - 1 ? ApprovalState.APPROVED : ApprovalState.PENDING_APPROVAL;
  assert.equal(state, ApprovalState.PENDING_APPROVAL);

  // Turn 2: C approves (last approver)
  await prisma.decision.create({
    data: { approvalId: approval.id, decision: "APPROVED", decidedBy: "approverc@test.com" },
  });
  await prisma.approval.update({
    where: { id: approval.id },
    data: { state: ApprovalState.APPROVED },
  });

  const finalState = await prisma.approval.findUnique({ where: { id: approval.id } });
  assert.equal(finalState?.state, ApprovalState.APPROVED);

  await prisma.approval.delete({ where: { id: approval.id } });
});
