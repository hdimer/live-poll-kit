const { sql, isDatabaseConfigured } = require('./_db');

function isAdminAuthorized(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token === process.env.ADMIN_SECRET;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (!isDatabaseConfigured()) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const db = sql();

  try {
    // GET /api/poll?group=X - public: get question(s) for a group
    if (req.method === 'GET' && req.query.group && !req.query.results) {
      const groupRows = await db`SELECT mode FROM poll_groups WHERE id = ${req.query.group}`;
      const mode = groupRows.length > 0 ? groupRows[0].mode : 'presenter';

      if (mode === 'auto') {
        // Auto-advance: return all questions, client handles sequencing
        const allQ = await db`
          SELECT id, type, question, options, position
          FROM poll_questions
          WHERE group_id = ${req.query.group}
          ORDER BY position
        `;
        return res.status(200).json({ mode: 'auto', questions: allQ, questionCount: allQ.length });
      }

      // Presenter-controlled: return only the active question
      const rows = await db`
        SELECT id, type, question, options, position
        FROM poll_questions
        WHERE group_id = ${req.query.group} AND active = true
        LIMIT 1
      `;
      const countRows = await db`
        SELECT COUNT(*)::int as total FROM poll_questions WHERE group_id = ${req.query.group}
      `;
      const questionCount = countRows[0].total;

      if (rows.length === 0) {
        return res.status(200).json({ mode: 'presenter', waiting: true, questionCount });
      }
      return res.status(200).json({ mode: 'presenter', ...rows[0], questionCount });
    }

    // GET /api/poll?id=X - public: get a single question for voting
    if (req.method === 'GET' && req.query.id && !req.query.results) {
      const rows = await db`
        SELECT id, type, question, options FROM poll_questions WHERE id = ${req.query.id}
      `;
      if (rows.length === 0) return res.status(404).json({ error: 'Question not found' });
      return res.status(200).json(rows[0]);
    }

    // GET /api/poll?id=X&results=1 - public: get results for one question
    if (req.method === 'GET' && req.query.id && req.query.results) {
      const q = await db`SELECT id, type, question, options FROM poll_questions WHERE id = ${req.query.id}`;
      const results = await db`
        SELECT answer, COUNT(*)::int as count
        FROM poll_responses
        WHERE question_id = ${req.query.id}
        GROUP BY answer
        ORDER BY count DESC
      `;
      const total = await db`
        SELECT COUNT(*)::int as total FROM poll_responses WHERE question_id = ${req.query.id}
      `;
      return res.status(200).json({
        question: q[0] || null,
        results,
        total: total[0].total,
      });
    }

    // GET /api/poll?group=X&results=all - public: get results for ALL questions in a group
    if (req.method === 'GET' && req.query.group && req.query.results === 'all') {
      const allQ = await db`
        SELECT id, type, question, options, position
        FROM poll_questions WHERE group_id = ${req.query.group} ORDER BY position
      `;
      const allResults = [];
      for (const q of allQ) {
        const results = await db`
          SELECT answer, COUNT(*)::int as count
          FROM poll_responses WHERE question_id = ${q.id}
          GROUP BY answer ORDER BY count DESC
        `;
        const total = await db`
          SELECT COUNT(*)::int as total FROM poll_responses WHERE question_id = ${q.id}
        `;
        allResults.push({
          question: q,
          results,
          total: total[0].total,
        });
      }
      return res.status(200).json({ questions: allResults });
    }

    // GET /api/poll?group=X&results=1 - public: get results for the active question in a group
    if (req.method === 'GET' && req.query.group && req.query.results) {
      const active = await db`
        SELECT id, type, question, options, position
        FROM poll_questions
        WHERE group_id = ${req.query.group} AND active = true
        LIMIT 1
      `;
      if (active.length === 0) return res.status(200).json({ waiting: true });

      const qId = active[0].id;
      const results = await db`
        SELECT answer, COUNT(*)::int as count
        FROM poll_responses WHERE question_id = ${qId}
        GROUP BY answer ORDER BY count DESC
      `;
      const total = await db`
        SELECT COUNT(*)::int as total FROM poll_responses WHERE question_id = ${qId}
      `;
      return res.status(200).json({
        question: active[0],
        results,
        total: total[0].total,
      });
    }

    // GET /api/poll - admin: list events, groups, and questions
    if (req.method === 'GET') {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
      const events = await db`SELECT * FROM poll_events ORDER BY event_date DESC, created_at DESC`;
      const groups = await db`SELECT * FROM poll_groups ORDER BY position, created_at`;
      const questions = await db`SELECT * FROM poll_questions ORDER BY group_id, position, created_at`;
      return res.status(200).json({ events, groups, questions });
    }

    // POST with questionId + answer - public: submit a vote
    if (req.method === 'POST' && req.body.questionId && req.body.answer !== undefined) {
      const answer = (req.body.answer || '').toString().trim();
      if (!answer) return res.status(400).json({ error: 'Answer is required' });

      await db`
        INSERT INTO poll_responses (question_id, answer)
        VALUES (${req.body.questionId}, ${answer})
      `;
      return res.status(200).json({ success: true });
    }

    // POST with action=createEvent - admin
    if (req.method === 'POST' && req.body.action === 'createEvent') {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
      const { title, eventDate } = req.body;
      if (!title) return res.status(400).json({ error: 'Title is required' });
      const rows = await db`INSERT INTO poll_events (title, event_date) VALUES (${title}, ${eventDate || null}) RETURNING *`;
      return res.status(201).json(rows[0]);
    }

    // POST with action=createGroup - admin
    if (req.method === 'POST' && req.body.action === 'createGroup') {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
      const { title, eventId } = req.body;
      if (!title) return res.status(400).json({ error: 'Title is required' });
      const posRows = await db`SELECT COALESCE(MAX(position), -1) + 1 as next FROM poll_groups WHERE event_id = ${eventId || null}`;
      const rows = await db`INSERT INTO poll_groups (title, event_id, position) VALUES (${title}, ${eventId || null}, ${posRows[0].next}) RETURNING *`;
      return res.status(201).json(rows[0]);
    }

    // POST with action=addQuestion - admin: add question to a group
    if (req.method === 'POST' && req.body.action === 'addQuestion') {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
      const { groupId, type, question, options } = req.body;
      // Get next position
      const posRows = await db`SELECT COALESCE(MAX(position), -1) + 1 as next FROM poll_questions WHERE group_id = ${groupId}`;
      const position = posRows[0].next;
      const rows = await db`
        INSERT INTO poll_questions (group_id, type, question, options, position)
        VALUES (${groupId}, ${type}, ${question}, ${options ? JSON.stringify(options) : null}, ${position})
        RETURNING *
      `;
      return res.status(201).json(rows[0]);
    }

    // POST with type (no action) - admin: create standalone question
    if (req.method === 'POST' && req.body.type && !req.body.action) {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
      const { type, question, options, eventId } = req.body;
      if (!question) return res.status(400).json({ error: 'Question is required' });
      const posRows = await db`SELECT COALESCE(MAX(position), -1) + 1 as next FROM poll_questions WHERE event_id = ${eventId || null} AND group_id IS NULL`;
      const rows = await db`
        INSERT INTO poll_questions (type, question, options, event_id, position)
        VALUES (${type}, ${question}, ${options ? JSON.stringify(options) : null}, ${eventId || null}, ${posRows[0].next})
        RETURNING *
      `;
      return res.status(201).json(rows[0]);
    }

    // PATCH with action=activate - admin: activate a specific question (deactivate others in same group)
    if (req.method === 'PATCH' && req.body.action === 'activate') {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
      const { id, groupId } = req.body;
      if (groupId) {
        await db`UPDATE poll_questions SET active = false WHERE group_id = ${groupId}`;
      } else {
        await db`UPDATE poll_questions SET active = false WHERE active = true`;
      }
      if (id) {
        await db`UPDATE poll_questions SET active = true WHERE id = ${id}`;
      }
      return res.status(200).json({ success: true });
    }

    // PATCH with action=editQuestion - admin: edit question text and options
    if (req.method === 'PATCH' && req.body.action === 'editQuestion') {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
      const { id, question, options, type } = req.body;
      if (!id) return res.status(400).json({ error: 'ID is required' });
      if (!question) return res.status(400).json({ error: 'Question is required' });
      const rows = await db`
        UPDATE poll_questions
        SET question = ${question}, options = ${options ? JSON.stringify(options) : null}, type = ${type || 'poll'}
        WHERE id = ${id}
        RETURNING *
      `;
      if (rows.length === 0) return res.status(404).json({ error: 'Question not found' });
      return res.status(200).json(rows[0]);
    }

    // PATCH with action=editGroup - admin: edit group title
    if (req.method === 'PATCH' && req.body.action === 'editGroup') {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
      const { id, title, mode } = req.body;
      if (!id) return res.status(400).json({ error: 'ID is required' });
      if (title) await db`UPDATE poll_groups SET title = ${title} WHERE id = ${id}`;
      if (mode) await db`UPDATE poll_groups SET mode = ${mode} WHERE id = ${id}`;
      return res.status(200).json({ success: true });
    }

    // PATCH with action=reorder - admin: update positions
    if (req.method === 'PATCH' && req.body.action === 'reorder') {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
      const { items } = req.body; // [{id, position, table}]
      if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'Items array required' });
      for (const item of items) {
        if (item.table === 'groups') {
          await db`UPDATE poll_groups SET position = ${item.position} WHERE id = ${item.id}`;
        } else {
          await db`UPDATE poll_questions SET position = ${item.position} WHERE id = ${item.id}`;
        }
      }
      return res.status(200).json({ success: true });
    }

    // PATCH - admin: toggle active (backwards compat)
    if (req.method === 'PATCH') {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
      const { id, active } = req.body;
      if (!id) return res.status(400).json({ error: 'ID is required' });
      if (active) {
        await db`UPDATE poll_questions SET active = false WHERE active = true`;
      }
      await db`UPDATE poll_questions SET active = ${!!active} WHERE id = ${id}`;
      return res.status(200).json({ success: true });
    }

    // DELETE with eventId - admin: delete an event
    if (req.method === 'DELETE' && req.body.eventId) {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
      await db`DELETE FROM poll_events WHERE id = ${req.body.eventId}`;
      return res.status(200).json({ success: true });
    }

    // DELETE with groupId - admin: delete a group
    if (req.method === 'DELETE' && req.body.groupId) {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
      await db`DELETE FROM poll_groups WHERE id = ${req.body.groupId}`;
      return res.status(200).json({ success: true });
    }

    // DELETE with action=reset - admin: clear all responses for a question
    if (req.method === 'DELETE' && req.body.action === 'reset') {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'ID is required' });
      await db`DELETE FROM poll_responses WHERE question_id = ${id}`;
      return res.status(200).json({ success: true });
    }

    // DELETE with id - admin: delete a question
    if (req.method === 'DELETE') {
      if (!isAdminAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'ID is required' });
      await db`DELETE FROM poll_questions WHERE id = ${id}`;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Poll error:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
};
