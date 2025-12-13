/**
 * Export API Routes
 * CSV and PDF export for lists and turfs
 */

import { Router } from 'express';
import { db } from '../config/database.js';
import PDFDocument from 'pdfkit';
import { format } from 'fast-csv';

const router = Router();

/**
 * GET /api/export/csv/list/:id
 * Export a list as CSV
 */
router.get('/csv/list/:id', async (req, res) => {
  try {
    const userId = req.userId || 1;
    const { id } = req.params;
    const { include_phone = 'true', include_history = 'false' } = req.query;

    // Verify list ownership
    const list = await db.oneOrNone('SELECT id, name FROM lists WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    // Get voters
    const voters = await db.manyOrNone(`
      SELECT
        v.ncid,
        v.first_name,
        v.middle_name,
        v.last_name,
        v.street_address,
        v.city,
        v.zip_code,
        v.county_name,
        v.precinct_name,
        v.age,
        v.sex,
        v.race,
        v.party,
        v.registration_date,
        ${include_phone === 'true' ? 'v.phone,' : ''}
        v.turnout_score,
        v.partisan_score,
        lv.household_id,
        lv.contact_status
      FROM list_voters lv
      JOIN voters v ON lv.ncid = v.ncid
      WHERE lv.list_id = $1
      ORDER BY lv.sort_order
    `, [id]);

    // Set headers for CSV download
    const filename = `${list.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Create CSV stream
    const csvStream = format({ headers: true });
    csvStream.pipe(res);

    for (const voter of voters) {
      csvStream.write(voter);
    }

    csvStream.end();

  } catch (err) {
    console.error('[CSV Export Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/export/csv/turf/:id
 * Export a turf as CSV
 */
router.get('/csv/turf/:id', async (req, res) => {
  try {
    const userId = req.userId || 1;
    const { id } = req.params;

    const turf = await db.oneOrNone('SELECT id, name, list_id FROM turfs WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!turf) {
      return res.status(404).json({ error: 'Turf not found' });
    }

    const voters = await db.manyOrNone(`
      SELECT
        v.ncid,
        v.first_name,
        v.last_name,
        v.street_address,
        v.city,
        v.zip_code,
        v.age,
        v.party,
        v.phone,
        v.turnout_score,
        lv.household_id,
        lv.sort_order
      FROM list_voters lv
      JOIN voters v ON lv.ncid = v.ncid
      WHERE lv.turf_id = $1
      ORDER BY lv.sort_order
    `, [id]);

    const filename = `${turf.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const csvStream = format({ headers: true });
    csvStream.pipe(res);

    for (const voter of voters) {
      csvStream.write(voter);
    }

    csvStream.end();

  } catch (err) {
    console.error('[Turf CSV Export Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/export/pdf/list/:id
 * Export a list as PDF walk sheet
 */
router.get('/pdf/list/:id', async (req, res) => {
  try {
    const userId = req.userId || 1;
    const { id } = req.params;
    const { format: pdfFormat = 'walk' } = req.query; // 'walk' or 'call'

    const list = await db.oneOrNone('SELECT id, name, voter_count FROM lists WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    let voters;
    if (pdfFormat === 'walk') {
      // Group by household for walk sheets
      voters = await db.manyOrNone(`
        SELECT
          v.first_name,
          v.last_name,
          v.street_address,
          v.city,
          v.zip_code,
          v.age,
          v.party,
          v.turnout_score,
          lv.household_id,
          (SELECT COUNT(*) FROM list_voters lv2 WHERE lv2.list_id = $1 AND lv2.household_id = lv.household_id) as household_size
        FROM list_voters lv
        JOIN voters v ON lv.ncid = v.ncid
        WHERE lv.list_id = $1
        ORDER BY v.zip_code, v.street_address, v.last_name
      `, [id]);
    } else {
      // Individual voters for call sheets
      voters = await db.manyOrNone(`
        SELECT
          v.first_name,
          v.last_name,
          v.phone,
          v.street_address,
          v.city,
          v.age,
          v.party,
          v.turnout_score
        FROM list_voters lv
        JOIN voters v ON lv.ncid = v.ncid
        WHERE lv.list_id = $1
        ORDER BY lv.sort_order
      `, [id]);
    }

    const filename = `${list.name.replace(/[^a-z0-9]/gi, '_')}_${pdfFormat}_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Create PDF
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    doc.pipe(res);

    // Title
    doc.fontSize(18).font('Helvetica-Bold').text(list.name, { align: 'center' });
    doc.fontSize(12).font('Helvetica').text(`${pdfFormat === 'walk' ? 'Walk' : 'Call'} Sheet - ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.text(`Total: ${voters.length} voters`, { align: 'center' });
    doc.moveDown(2);

    if (pdfFormat === 'walk') {
      generateWalkSheet(doc, voters);
    } else {
      generateCallSheet(doc, voters);
    }

    doc.end();

  } catch (err) {
    console.error('[PDF Export Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/export/pdf/turf/:id
 * Export a turf as PDF walk sheet
 */
router.get('/pdf/turf/:id', async (req, res) => {
  try {
    const userId = req.userId || 1;
    const { id } = req.params;

    const turf = await db.oneOrNone(`
      SELECT t.id, t.name, t.voter_count, t.door_count, t.estimated_time_minutes, t.list_id
      FROM turfs t
      WHERE t.id = $1 AND t.user_id = $2
    `, [id, userId]);

    if (!turf) {
      return res.status(404).json({ error: 'Turf not found' });
    }

    // Get voters in route order if available
    const voters = await db.manyOrNone(`
      SELECT
        v.first_name,
        v.last_name,
        v.street_address,
        v.city,
        v.zip_code,
        v.age,
        v.party,
        v.phone,
        v.turnout_score,
        lv.household_id,
        lv.sort_order
      FROM list_voters lv
      JOIN voters v ON lv.ncid = v.ncid
      WHERE lv.turf_id = $1
      ORDER BY lv.sort_order
    `, [id]);

    const filename = `${turf.name.replace(/[^a-z0-9]/gi, '_')}_walksheet_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    doc.pipe(res);

    // Title
    doc.fontSize(16).font('Helvetica-Bold').text(turf.name, { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`Walk Sheet - ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.text(`Doors: ${turf.door_count} | Voters: ${turf.voter_count} | Est. Time: ${turf.estimated_time_minutes} min`, { align: 'center' });
    doc.moveDown(1.5);

    generateWalkSheet(doc, voters);

    doc.end();

  } catch (err) {
    console.error('[Turf PDF Export Error]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Generate walk sheet content
 */
function generateWalkSheet(doc, voters) {
  const pageWidth = doc.page.width - 80;
  const colWidths = {
    order: 30,
    name: 120,
    address: 180,
    info: 80,
    result: 100,
  };

  // Header
  doc.fontSize(9).font('Helvetica-Bold');
  let x = 40;
  doc.text('#', x, doc.y, { width: colWidths.order });
  x += colWidths.order;
  doc.text('Name', x, doc.y - 12, { width: colWidths.name });
  x += colWidths.name;
  doc.text('Address', x, doc.y - 12, { width: colWidths.address });
  x += colWidths.address;
  doc.text('Info', x, doc.y - 12, { width: colWidths.info });
  x += colWidths.info;
  doc.text('Result', x, doc.y - 12, { width: colWidths.result });

  doc.moveDown(0.5);
  doc.moveTo(40, doc.y).lineTo(pageWidth + 40, doc.y).stroke();
  doc.moveDown(0.3);

  let currentHousehold = null;
  let doorNumber = 0;
  let rowY = doc.y;

  doc.font('Helvetica').fontSize(8);

  for (let i = 0; i < voters.length; i++) {
    const voter = voters[i];

    // Check for page break
    if (doc.y > doc.page.height - 80) {
      doc.addPage();
      rowY = 50;
      doc.y = rowY;
    }

    // New household = new door
    const isNewHousehold = voter.household_id !== currentHousehold;
    if (isNewHousehold) {
      doorNumber++;
      currentHousehold = voter.household_id;

      // Add slight spacing between households
      if (i > 0) {
        doc.moveDown(0.3);
      }
    }

    rowY = doc.y;
    x = 40;

    // Door number (only for first person in household)
    if (isNewHousehold) {
      doc.font('Helvetica-Bold').text(doorNumber.toString(), x, rowY, { width: colWidths.order });
    }
    x += colWidths.order;

    // Name
    doc.font('Helvetica').text(`${voter.first_name} ${voter.last_name}`, x, rowY, { width: colWidths.name });
    x += colWidths.name;

    // Address (only for first person in household)
    if (isNewHousehold) {
      const addr = `${voter.street_address}\n${voter.city} ${voter.zip_code}`;
      doc.text(addr, x, rowY, { width: colWidths.address });
    }
    x += colWidths.address;

    // Info (age, party, score)
    const info = `${voter.age || '-'} ${voter.party || '-'}\nScore: ${voter.turnout_score || '-'}`;
    doc.text(info, x, rowY, { width: colWidths.info });
    x += colWidths.info;

    // Result checkbox area
    doc.rect(x, rowY, 12, 12).stroke();
    doc.text('NH', x + 18, rowY, { width: 20 });
    doc.rect(x + 40, rowY, 12, 12).stroke();
    doc.text('MV', x + 58, rowY, { width: 20 });

    doc.moveDown(1.2);
  }

  // Legend at bottom
  doc.moveDown(2);
  doc.fontSize(7).font('Helvetica');
  doc.text('NH = Not Home | MV = Moved | Notes: _______________________', { align: 'left' });
}

/**
 * Generate call sheet content
 */
function generateCallSheet(doc, voters) {
  const pageWidth = doc.page.width - 80;

  // Header
  doc.fontSize(9).font('Helvetica-Bold');
  let x = 40;
  doc.text('#', x, doc.y, { width: 25 });
  doc.text('Name', x + 25, doc.y - 11, { width: 100 });
  doc.text('Phone', x + 125, doc.y - 11, { width: 90 });
  doc.text('City', x + 215, doc.y - 11, { width: 80 });
  doc.text('Party', x + 295, doc.y - 11, { width: 40 });
  doc.text('Age', x + 335, doc.y - 11, { width: 30 });
  doc.text('Result', x + 365, doc.y - 11, { width: 80 });

  doc.moveDown(0.5);
  doc.moveTo(40, doc.y).lineTo(pageWidth + 40, doc.y).stroke();
  doc.moveDown(0.3);

  doc.font('Helvetica').fontSize(8);

  for (let i = 0; i < voters.length; i++) {
    const voter = voters[i];

    if (doc.y > doc.page.height - 60) {
      doc.addPage();
      doc.y = 50;
    }

    const rowY = doc.y;
    x = 40;

    doc.text((i + 1).toString(), x, rowY, { width: 25 });
    doc.text(`${voter.first_name} ${voter.last_name}`, x + 25, rowY, { width: 100 });
    doc.text(voter.phone || '—', x + 125, rowY, { width: 90 });
    doc.text(voter.city || '', x + 215, rowY, { width: 80 });
    doc.text(voter.party || '', x + 295, rowY, { width: 40 });
    doc.text(voter.age?.toString() || '', x + 335, rowY, { width: 30 });

    // Result area
    doc.rect(x + 365, rowY - 2, pageWidth - 325, 14).stroke();

    doc.moveDown(1);
  }
}

/**
 * GET /api/export/query
 * Export query results as CSV (without creating a list)
 */
router.post('/query', async (req, res) => {
  try {
    const { query_config, format: exportFormat = 'csv' } = req.body;

    if (!query_config) {
      return res.status(400).json({ error: 'query_config is required' });
    }

    // Build query (simplified - should match query.js logic)
    const conditions = ['registration_status = \'ACTIVE\''];
    const params = [];
    let paramIndex = 1;

    if (query_config.county) {
      conditions.push(`county_name = ANY($${paramIndex})`);
      params.push(query_config.county);
      paramIndex++;
    }

    if (query_config.party) {
      conditions.push(`party = ANY($${paramIndex})`);
      params.push(query_config.party);
      paramIndex++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const voters = await db.manyOrNone(`
      SELECT
        ncid, first_name, last_name, street_address, city, zip_code,
        county_name, precinct_name, age, sex, party, phone,
        turnout_score, partisan_score
      FROM voters
      ${whereClause}
      ORDER BY last_name, first_name
      LIMIT 50000
    `, params);

    const filename = `voter_export_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const csvStream = format({ headers: true });
    csvStream.pipe(res);

    for (const voter of voters) {
      csvStream.write(voter);
    }

    csvStream.end();

  } catch (err) {
    console.error('[Query Export Error]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
