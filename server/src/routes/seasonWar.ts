import express from 'express';
import { claimPreview, current, exportManifest, me, radar, squads } from '../controllers/seasonWarController';

const router = express.Router();

// Read-only War Room read-model surface. No claim, admin, or external-write paths live here.
router.get('/current', current);
router.get('/me', me);
router.get('/seasons/:seasonId/radar', radar);
router.get('/seasons/:seasonId/squads', squads);
router.get('/seasons/:seasonId/claim-preview', claimPreview);
router.get('/seasons/:seasonId/export-manifest', exportManifest);

export default router;
