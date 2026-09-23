import sql from 'mssql';
import { getPool } from '../../config/db';

/**
 * Helper gọi stored procedure có tham số — bọc lại pattern
 * `pool.request().input(...).execute(name)` đã dùng rải rác trong các service
 * .js hiện có (vd `sp_gen_topic_id`, `sp_gen_user_id`). Dùng cho code TypeScript
 * mới; không bắt buộc thay thế các lệnh gọi SP trực tiếp trong service .js.
 */
export interface SpParam {
  name: string;
  /** Kiểu tham số mssql, vd `sql.Int`, `sql.NVarChar(100)`. Bỏ trống để mssql tự suy luận. */
  type?: unknown;
  value: unknown;
}

export interface SpResult<T = Record<string, unknown>> {
  recordset: T[];
  recordsets: T[][];
  output: Record<string, unknown>;
  rowsAffected: number[];
  returnValue: number;
}

export async function execProcedure<T = Record<string, unknown>>(
  procedureName: string,
  params: SpParam[] = [],
): Promise<SpResult<T>> {
  const pool = await getPool();
  const request = pool.request();
  for (const param of params) {
    if (param.type) {
      request.input(param.name, param.type as never, param.value as never);
    } else {
      request.input(param.name, param.value as never);
    }
  }
  const result = await request.execute(procedureName);
  return result as SpResult<T>;
}

export { sql };
