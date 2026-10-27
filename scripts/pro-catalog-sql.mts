// Writes the Pro catalog rows into migration 0009 (between the markers).
import fs from "node:fs";
import path from "node:path";
import { BEGIN, END, catalogSql } from "../src/lib/pro/catalog-sql";

const file = path.resolve(import.meta.dirname, "../supabase/migrations/0009_pro_universe.sql");
const sql = fs.readFileSync(file, "utf8");
const a = sql.indexOf(BEGIN);
const b = sql.indexOf(END);
if (a < 0 || b < a) throw new Error("catalog markers not found");
fs.writeFileSync(file, sql.slice(0, a + BEGIN.length) + "\n" + catalogSql() + "\n" + sql.slice(b));
console.log("catalog written");
