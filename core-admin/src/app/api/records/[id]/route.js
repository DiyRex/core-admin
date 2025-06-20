import { RecordService } from '../../../../services/recordService.js';

export default async function handler(req, res) {
  const { id } = req.query;

  try {
    switch (req.method) {
      case 'GET':
        const record = await RecordService.getRecord(parseInt(id));
        return res.status(200).json(record);

      case 'PUT':
        const updatedRecord = await RecordService.updateRecord(parseInt(id), req.body);
        return res.status(200).json(updatedRecord);

      case 'DELETE':
        const result = await RecordService.deleteRecord(parseInt(id));
        return res.status(200).json(result);

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Record API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
