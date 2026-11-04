import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../migrations/20261104_fix_voucher_random_generation.sql', import.meta.url);

describe('migration de correção da geração de segunda via', () => {
    it.each([
        'gerar_segunda_via_voucher_transporte',
        'substituir_voucher_por_divergencia'
    ])('%s gera código sem depender do search_path de pgcrypto', async (functionName) => {
        const sql = await readFile(migrationUrl, 'utf8');
        const functionStart = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}(`);
        expect(functionStart).toBeGreaterThanOrEqual(0);

        const functionEnd = sql.indexOf('$function$;', functionStart);
        expect(functionEnd).toBeGreaterThan(functionStart);
        const functionSql = sql.slice(functionStart, functionEnd);

        expect(functionSql).toMatch(/upper\(replace\(pg_catalog\.gen_random_uuid\(\)::text, '-', ''\)\)/i);
        expect(functionSql).not.toMatch(/gen_random_bytes\s*\(/i);
    });
});
