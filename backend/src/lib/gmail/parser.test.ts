import test from "node:test";
import assert from "node:assert/strict";
import { stripSignature, parseGmailMessage } from "./parser.js";

test("1. Plain body with no signature passes through unchanged", () => {
  const input = "Hi Team,\n\nPlease review the attached document.\n\nThanks in advance.";
  const result = stripSignature(input);
  assert.equal(result, input);
});

test("2. Exact example body with Shreya's signature and disclaimer reduces to 'hello'", () => {
  const input = `hello


Best Regards ,

Shreya Kumar | Application Developer | BlauPlug Innovations Pvt Ltd
_________________

 +91 7972467192 / +91 80909 80902 | shreya.kumar@blauplug.com<mailto:shreya.kumar@blauplug.com>

[cid:ebfc527b-9953-4227-82be-b0ad65864d11]

*****BlauPlug accepts no liability for the content of this email, or for the consequences of any actions taken on the basis of the information provided, unless that information is subsequently confirmed in writing. If you are not the intended recipient you are notified that disclosing, copying, distributing or taking any action in reliance on the contents of this information is strictly prohibited.*****`;

  const result = stripSignature(input);
  assert.equal(result, "hello");
});

test("3. SAME signature structure with completely different person/company reduces to 'hello'", () => {
  const input = `hello


Best Regards ,

John Doe | Principal Systems Engineer | Acme Global Logistics Inc
_________________

 +1 (555) 234-5678 / +1 (555) 987-6543 | john.doe@acme-global.org<mailto:john.doe@acme-global.org>

[cid:12345678-abcd-ef01-2345-6789abcdef01]

*****CONFIDENTIALITY NOTICE: This transmission is intended only for the use of the individual or entity to which it is addressed and may contain confidential information. If you are not the intended recipient, any disclosure, copying, distribution or action taken in reliance on it is prohibited.*****`;

  const result = stripSignature(input);
  assert.equal(result, "hello");
});

test("4. Disclaimer and CID block stripped without preceding sign-off line ('Best regards')", () => {
  const input = `Please approve this expense report for Q3 travel.

Jane Smith | Finance Operations | Global Apex Corp
_________________

 +44 20 7946 0912 | jane.smith@globalapex.com<mailto:jane.smith@globalapex.com>

[cid:99999999-8888-7777-6666-555555555555]

*****Global Apex Corp accepts no liability for the content of this email.*****`;

  const result = stripSignature(input);
  assert.equal(result, "Please approve this expense report for Q3 travel.");
});

test("5. Mid-sentence mentions of 'regards' or asterisks are NOT stripped", () => {
  const input = "Regarding the project timeline, we received a 5* rating from the client. Best regards to the team.";
  const result = stripSignature(input);
  assert.equal(result, input);
});

test("6. End-to-end parseGmailMessage produces clean bodyText", () => {
  const rawMessage = {
    id: "msg123",
    threadId: "thread123",
    payload: {
      headers: [
        { name: "Subject", value: "Purchase Request" },
        { name: "From", value: "Alice Corp <alice@corp.com>" },
        { name: "To", value: "approvals.blauplug@gmail.com" },
      ],
      mimeType: "text/plain",
      body: {
        data: Buffer.from(`Kindly review and approve the server migration request.

Regards,

Alice Wonder | IT Manager | Tech Solutions Ltd
_________________

 +1 800 555 0199 | alice@corp.com<mailto:alice@corp.com>

[cid:77777777-6666-5555-4444-333333333333]

*****Tech Solutions Ltd Disclaimer Notice*****`).toString("base64url"),
      },
    },
  };

  const parsed = parseGmailMessage(rawMessage);
  assert.equal(parsed.bodyText, "Kindly review and approve the server migration request.");
});
