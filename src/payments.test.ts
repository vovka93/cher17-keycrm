import { expect, test } from "bun:test";
import { SDK } from "./sdk.generated";

const api = new SDK("https://openapi.keycrm.app/v1", Bun.env["KEYCRM_KEY"]);

test("print payment methods list", async () => {
  const res = await api.order.getPaginatedListOfPaymentMethods();

  console.table(
    res.data.map((m) => ({
      id: m.id,
      alias: m.alias,
      name: m.name,
      active: m.is_active,
    })),
  );

  expect(res.data.length).toBeGreaterThan(0);
});
