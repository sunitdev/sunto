import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const compile = (text) =>
  "data:text/javascript;base64," +
  Buffer.from(
    ts.transpileModule(text, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  ).toString("base64");
const modelURL = compile(
  readFileSync(
    new URL("../packages/app/src/storage/model.ts", import.meta.url),
    "utf8",
  ),
);
test("failed local saves retain edits for retry, and export happens only after a successful save", async () => {
  let saved;
  let fail = false;
  let exports = 0;
  globalThis.suntoTestRequest = async (command, data) => {
    if (command === "load") return { data: saved };
    if (command === "save") {
      if (fail) throw Error("Disk full");
      saved = data;
      return {};
    }
    if (command === "choose") return { folder: "Sunto" };
    if (command === "exchange") {
      exports++;
      assert.equal(JSON.parse(saved).version, 1);
      return { files: JSON.parse(data).map((c) => JSON.stringify(c)) };
    }
    return {};
  };
  const driverURL = compile(
    "export const native = true; export const request = (command, data) => globalThis.suntoTestRequest(command, data);",
  );
  const source = readFileSync(
    new URL("../packages/app/src/storage/store.ts", import.meta.url),
    "utf8",
  )
    .replace('"./model"', JSON.stringify(modelURL))
    .replace('"./driver"', JSON.stringify(driverURL));
  const store = await import(compile(source));
  await store.start();
  await store.chooseFolder();
  const before = exports;
  fail = true;
  const id = await store.add();
  await store.update(id, { title: "Must survive a failed save" });
  assert.equal(
    store.getSnapshot().state.tasks[id].title,
    "Must survive a failed save",
  );
  assert.match(store.getSnapshot().error, /Disk full/);
  await store.sync();
  assert.equal(exports, before);
  fail = false;
  await store.retry();
  assert.equal(store.getSnapshot().error, "");
  assert.equal(JSON.parse(saved).tasks[id].title, "Must survive a failed save");
  assert.equal(exports, before + 1);
  delete globalThis.suntoTestRequest;
});
