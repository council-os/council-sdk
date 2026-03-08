"""Tests for trust certificates, federation, and compliance methods."""

import pytest
from unittest.mock import AsyncMock

from council.safety import (
    CertVerificationResult,
    ComplianceReport,
    FederatedThreatSignature,
    GovernanceStats,
    PublicKeyInfo,
    SafetyNamespace,
    TrustCertificate,
    TrustRoot,
)


@pytest.fixture
def transport():
    """Create a mock transport."""
    t = AsyncMock()
    t.get = AsyncMock()
    t.post = AsyncMock()
    return t


@pytest.fixture
def safety(transport):
    """Create a SafetyNamespace with a mocked transport."""
    return SafetyNamespace(transport)


# ── Trust Certificate Tests ───────────────────────────────────────────────────


class TestIssueTrustCert:
    @pytest.mark.asyncio
    async def test_calls_correct_endpoint(self, safety, transport):
        transport.post.return_value = {
            "data": {
                "id": "cert-1",
                "agentId": "agent-1",
                "orgId": "org-1",
                "trustDimensions": {
                    "provenance": 0,
                    "code": 1,
                    "hardware": 255,
                    "network": 0,
                    "behavioral": 85.0,
                },
                "governanceSummary": {
                    "totalActions": 100,
                    "autoApproved": 80,
                    "juryReviewed": 15,
                    "denied": 5,
                    "halts": 0,
                },
                "issuedAt": "2026-02-19T00:00:00Z",
                "expiresAt": "2026-02-20T00:00:00Z",
                "signature": "abc123",
            }
        }

        result = await safety.issue_trust_cert(
            agent_id="agent-1",
            org_id="org-1",
            trust_dimensions={
                "provenance": 0,
                "code": 1,
                "hardware": 255,
                "network": 0,
                "behavioral": 85.0,
            },
            governance_summary={
                "total_actions": 100,
                "auto_approved": 80,
                "jury_reviewed": 15,
                "denied": 5,
                "halts": 0,
            },
            validity_hours=24,
        )

        transport.post.assert_called_once_with(
            "/api/v1/safety/trust-certs",
            json={
                "agentId": "agent-1",
                "orgId": "org-1",
                "trustDimensions": {
                    "provenance": 0,
                    "code": 1,
                    "hardware": 255,
                    "network": 0,
                    "behavioral": 85.0,
                },
                "governanceSummary": {
                    "totalActions": 100,
                    "autoApproved": 80,
                    "juryReviewed": 15,
                    "denied": 5,
                    "halts": 0,
                },
                "validityHours": 24,
            },
        )

        assert isinstance(result, TrustCertificate)
        assert result.id == "cert-1"
        assert result.agent_id == "agent-1"
        assert result.org_id == "org-1"
        assert result.trust_dimensions.hardware == 255
        assert result.trust_dimensions.behavioral == 85.0
        assert result.governance_summary.total_actions == 100
        assert result.governance_summary.jury_reviewed == 15
        assert result.signature == "abc123"


class TestGetTrustCerts:
    @pytest.mark.asyncio
    async def test_calls_correct_endpoint(self, safety, transport):
        transport.get.return_value = {
            "data": [
                {
                    "id": "cert-1",
                    "agentId": "agent-1",
                    "orgId": "org-1",
                    "trustDimensions": {"provenance": 50},
                    "governanceSummary": {"totalActions": 10},
                    "issuedAt": "2026-02-19T00:00:00Z",
                    "expiresAt": "2026-02-20T00:00:00Z",
                    "signature": "sig1",
                },
                {
                    "id": "cert-2",
                    "agentId": "agent-1",
                    "orgId": "org-1",
                    "trustDimensions": {"provenance": 70},
                    "governanceSummary": {"totalActions": 20},
                    "issuedAt": "2026-02-18T00:00:00Z",
                    "expiresAt": "2026-02-19T00:00:00Z",
                    "signature": "sig2",
                },
            ]
        }

        result = await safety.get_trust_certs(agent_id="agent-1")

        transport.get.assert_called_once_with("/api/v1/safety/trust-certs/agent-1")
        assert len(result) == 2
        assert result[0].id == "cert-1"
        assert result[1].id == "cert-2"
        assert result[0].trust_dimensions.provenance == 50.0
        assert result[1].trust_dimensions.provenance == 70.0


class TestVerifyTrustCert:
    @pytest.mark.asyncio
    async def test_calls_correct_endpoint(self, safety, transport):
        transport.post.return_value = {
            "data": {
                "valid": True,
                "reason": None,
                "checkedAt": "2026-02-19T00:00:00Z",
            }
        }

        cert_dict = {"id": "cert-1", "signature": "abc"}
        result = await safety.verify_trust_cert(certificate=cert_dict)

        transport.post.assert_called_once_with(
            "/api/v1/safety/trust-certs/verify",
            json={"certificate": cert_dict},
        )
        assert isinstance(result, CertVerificationResult)
        assert result.valid is True
        assert result.reason is None

    @pytest.mark.asyncio
    async def test_invalid_certificate(self, safety, transport):
        transport.post.return_value = {
            "data": {
                "valid": False,
                "reason": "Signature mismatch",
                "checkedAt": "2026-02-19T00:00:00Z",
            }
        }

        result = await safety.verify_trust_cert(certificate={"id": "bad"})
        assert result.valid is False
        assert result.reason == "Signature mismatch"


class TestGetPublicKey:
    @pytest.mark.asyncio
    async def test_calls_correct_endpoint(self, safety, transport):
        transport.get.return_value = {
            "data": {
                "orgId": "org-1",
                "publicKey": "04abcdef",
                "algorithm": "ed25519",
                "createdAt": "2026-01-01T00:00:00Z",
            }
        }

        result = await safety.get_public_key()

        transport.get.assert_called_once_with("/api/v1/safety/trust-certs/public-key")
        assert isinstance(result, PublicKeyInfo)
        assert result.org_id == "org-1"
        assert result.public_key == "04abcdef"
        assert result.algorithm == "ed25519"


# ── Federation Tests ──────────────────────────────────────────────────────────


class TestGetTrustRoots:
    @pytest.mark.asyncio
    async def test_calls_correct_endpoint(self, safety, transport):
        transport.get.return_value = {
            "data": [
                {
                    "id": "root-1",
                    "orgId": "org-2",
                    "publicKey": "04aabb",
                    "label": "Partner Org",
                    "addedAt": "2026-02-19T00:00:00Z",
                },
            ]
        }

        result = await safety.get_trust_roots()

        transport.get.assert_called_once_with("/api/v1/safety/federation/trust-roots")
        assert len(result) == 1
        assert isinstance(result[0], TrustRoot)
        assert result[0].org_id == "org-2"
        assert result[0].label == "Partner Org"


class TestAddTrustRoot:
    @pytest.mark.asyncio
    async def test_calls_correct_endpoint(self, safety, transport):
        transport.post.return_value = {
            "data": {
                "id": "root-2",
                "orgId": "org-3",
                "publicKey": "04ccdd",
                "label": "Another Org",
                "addedAt": "2026-02-19T00:00:00Z",
            }
        }

        result = await safety.add_trust_root(
            org_id="org-3",
            public_key="04ccdd",
            label="Another Org",
        )

        transport.post.assert_called_once_with(
            "/api/v1/safety/federation/trust-roots",
            json={
                "orgId": "org-3",
                "publicKey": "04ccdd",
                "label": "Another Org",
            },
        )
        assert isinstance(result, TrustRoot)
        assert result.id == "root-2"
        assert result.public_key == "04ccdd"


class TestGetThreatSignatures:
    @pytest.mark.asyncio
    async def test_calls_correct_endpoint_no_filter(self, safety, transport):
        transport.get.return_value = {
            "data": [
                {
                    "id": "sig-1",
                    "category": "collusion",
                    "description": "Coordinated scope escalation",
                    "sourceOrgId": "org-1",
                    "confidence": 0.9,
                    "createdAt": "2026-02-19T00:00:00Z",
                    "active": True,
                },
            ]
        }

        result = await safety.get_threat_signatures()

        transport.get.assert_called_once_with(
            "/api/v1/safety/federation/signatures", params={}
        )
        assert len(result) == 1
        assert isinstance(result[0], FederatedThreatSignature)
        assert result[0].category == "collusion"
        assert result[0].confidence == 0.9

    @pytest.mark.asyncio
    async def test_calls_with_category_filter(self, safety, transport):
        transport.get.return_value = {"data": []}

        await safety.get_threat_signatures(category="collusion")

        transport.get.assert_called_once_with(
            "/api/v1/safety/federation/signatures",
            params={"category": "collusion"},
        )


# ── Compliance Tests ──────────────────────────────────────────────────────────


class TestGetGovernanceStats:
    @pytest.mark.asyncio
    async def test_calls_correct_endpoint(self, safety, transport):
        transport.get.return_value = {
            "data": {
                "totalActions": 500,
                "autoApproved": 400,
                "juryReviewed": 80,
                "denied": 15,
                "escalated": 5,
                "halts": 2,
                "activeAgents": 12,
            }
        }

        result = await safety.get_governance_stats()

        transport.get.assert_called_once_with("/api/v1/safety/compliance/stats")
        assert isinstance(result, GovernanceStats)
        assert result.total_actions == 500
        assert result.auto_approved == 400
        assert result.jury_reviewed == 80
        assert result.denied == 15
        assert result.escalated == 5
        assert result.halts == 2
        assert result.active_agents == 12


class TestGetComplianceReport:
    @pytest.mark.asyncio
    async def test_calls_correct_endpoint(self, safety, transport):
        transport.get.return_value = {
            "data": {
                "startMs": 1000,
                "endMs": 2000,
                "governance": {
                    "totalActions": 200,
                    "autoApproved": 180,
                    "juryReviewed": 15,
                    "denied": 3,
                    "escalated": 2,
                    "halts": 0,
                    "activeAgents": 8,
                },
                "certificatesIssued": 50,
                "certificatesExpired": 10,
                "invariantViolations": 1,
                "generatedAt": "2026-02-19T00:00:00Z",
            }
        }

        result = await safety.get_compliance_report(start_ms=1000, end_ms=2000)

        transport.get.assert_called_once_with(
            "/api/v1/safety/compliance/report",
            params={"start": 1000, "end": 2000},
        )
        assert isinstance(result, ComplianceReport)
        assert result.start_ms == 1000
        assert result.end_ms == 2000
        assert result.governance.total_actions == 200
        assert result.governance.auto_approved == 180
        assert result.certificates_issued == 50
        assert result.certificates_expired == 10
        assert result.invariant_violations == 1
        assert result.generated_at == "2026-02-19T00:00:00Z"


# ── Merkle Proof Parsing Tests ────────────────────────────────────────────────


class TestMerkleProofParsing:
    @pytest.mark.asyncio
    async def test_certificate_with_merkle_proof(self, safety, transport):
        transport.post.return_value = {
            "data": {
                "id": "cert-mp",
                "agentId": "agent-1",
                "orgId": "org-1",
                "trustDimensions": {"behavioral": 90},
                "governanceSummary": {"totalActions": 50},
                "issuedAt": "2026-02-19T00:00:00Z",
                "expiresAt": "2026-02-20T00:00:00Z",
                "signature": "sig",
                "merkleProof": {
                    "leafHash": "aabb",
                    "treeSize": 128,
                    "inclusionPath": ["cc", "dd", "ee"],
                },
                "signedTreeHead": {
                    "treeSize": 128,
                    "rootHash": "ffaa",
                    "timestamp": "2026-02-19T00:00:00Z",
                    "signature": "sth-sig",
                },
            }
        }

        result = await safety.issue_trust_cert(
            agent_id="agent-1",
            org_id="org-1",
            trust_dimensions={"behavioral": 90},
            governance_summary={"total_actions": 50},
        )

        assert result.merkle_proof is not None
        assert result.merkle_proof.leaf_hash == "aabb"
        assert result.merkle_proof.tree_size == 128
        assert result.merkle_proof.inclusion_path == ["cc", "dd", "ee"]
        assert result.signed_tree_head is not None
        assert result.signed_tree_head.root_hash == "ffaa"
        assert result.signed_tree_head.signature == "sth-sig"
