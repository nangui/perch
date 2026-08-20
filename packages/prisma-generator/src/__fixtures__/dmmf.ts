/**
 * A hand-written DMMF standing in for a twelve-model Prisma schema: one-to-one,
 * one-to-many and many-to-many relations, enums, native types, soft delete and
 * documentation.
 *
 * Hand-written on purpose. Generating it would require a Prisma client, a
 * database and a migration, which would make the fastest tests in the repo the
 * slowest. The risk that comes with that choice — a fixture drifting from what
 * Prisma really emits — is exactly what the contract test guards.
 */
import type { Dmmf, DmmfField, DmmfModel } from "../dmmf-reader.js";

type Partial<T> = { [K in keyof T]?: T[K] };

function scalar(name: string, type: string, over: Partial<DmmfField> = {}): DmmfField {
  return {
    name,
    kind: "scalar",
    type,
    isRequired: true,
    isList: false,
    isId: false,
    isUnique: false,
    isReadOnly: false,
    hasDefaultValue: false,
    ...over,
  };
}

function id(name = "id"): DmmfField {
  return scalar(name, "Int", {
    isId: true,
    isUnique: true,
    hasDefaultValue: true,
    default: { name: "autoincrement", args: [] },
  });
}

/**
 * A foreign key. Prisma flags these `isReadOnly` — the flag means "a relation
 * owns this column", not "the database generates it", which is why an
 * autoincrement `id` above does not carry it.
 */
function fk(name: string, over: Partial<DmmfField> = {}): DmmfField {
  return scalar(name, "Int", { isReadOnly: true, ...over });
}

function enumField(
  name: string,
  type: string,
  over: Partial<DmmfField> = {},
): DmmfField {
  return { ...scalar(name, type, over), kind: "enum" };
}

/**
 * The name Prisma gives a relation nobody named: the two models, in order.
 *
 * Derived here rather than copied from what the generator emitted, so the
 * contract test compares two independent readings instead of one with itself.
 */
function pair(owner: string, target: string): string {
  return [owner, target].sort().join("To");
}

function relation(
  owner: string,
  name: string,
  type: string,
  over: Partial<DmmfField> = {},
): DmmfField {
  return {
    name,
    kind: "object",
    type,
    isRequired: true,
    isList: false,
    isId: false,
    isUnique: false,
    isReadOnly: false,
    hasDefaultValue: false,
    relationName: pair(owner, type),
    relationFromFields: [],
    relationToFields: [],
    ...over,
  };
}

function toOne(
  owner: string,
  name: string,
  type: string,
  fk: string,
  over: Partial<DmmfField> = {},
) {
  return relation(owner, name, type, {
    relationFromFields: [fk],
    relationToFields: ["id"],
    relationOnDelete: "Cascade",
    ...over,
  });
}

function toMany(
  owner: string,
  name: string,
  type: string,
  over: Partial<DmmfField> = {},
) {
  return relation(owner, name, type, { isList: true, isRequired: false, ...over });
}

const models: DmmfModel[] = [
  {
    name: "User",
    dbName: "users",
    documentation: "Someone who can sign in.",
    fields: [
      id(),
      scalar("email", "String", {
        isUnique: true,
        nativeType: ["VarChar", ["255"]],
        documentation: "Used to sign in. Must be unique.",
      }),
      scalar("name", "String", { isRequired: false, nativeType: ["VarChar", ["120"]] }),
      scalar("passwordHash", "String", { nativeType: ["VarChar", ["255"]] }),
      scalar("websiteUrl", "String", { isRequired: false }),
      scalar("bio", "String", { isRequired: false, nativeType: ["Text", []] }),
      scalar("isActive", "Boolean", { hasDefaultValue: true, default: true }),
      scalar("birthDate", "DateTime", { isRequired: false }),
      scalar("createdAt", "DateTime", {
        hasDefaultValue: true,
        default: { name: "now", args: [] },
      }),
      scalar("updatedAt", "DateTime", { isUpdatedAt: true }),
      scalar("deletedAt", "DateTime", { isRequired: false }),
      enumField("role", "Role", { hasDefaultValue: true, default: "VIEWER" }),
      scalar("preferences", "Json", { isRequired: false }),
      relation("User", "profile", "Profile", { isRequired: false }),
      toMany("User", "posts", "Post"),
      toMany("User", "comments", "Comment"),
      toMany("User", "orders", "Order"),
    ],
    uniqueFields: [],
  },
  {
    // One-to-one: the owning side carries the foreign key and is unique.
    name: "Profile",
    dbName: "profiles",
    fields: [
      id(),
      scalar("headline", "String", {
        isRequired: false,
        nativeType: ["VarChar", ["200"]],
      }),
      scalar("avatarUrl", "String", { isRequired: false }),
      fk("userId", { isUnique: true }),
      toOne("Profile", "user", "User", "userId"),
    ],
    uniqueFields: [],
  },
  {
    name: "Post",
    dbName: "posts",
    documentation: "An article.",
    fields: [
      id(),
      scalar("title", "String", { nativeType: ["VarChar", ["200"]] }),
      scalar("slug", "String", { isUnique: true, nativeType: ["VarChar", ["200"]] }),
      scalar("body", "String", { nativeType: ["Text", []] }),
      scalar("publishedOn", "DateTime", { isRequired: false }),
      scalar("viewCount", "Int", { hasDefaultValue: true, default: 0 }),
      enumField("status", "PostStatus", { hasDefaultValue: true, default: "DRAFT" }),
      fk("authorId"),
      fk("categoryId", { isRequired: false }),
      toOne("Post", "author", "User", "authorId"),
      toOne("Post", "category", "Category", "categoryId", { isRequired: false }),
      toMany("Post", "comments", "Comment"),
      // Many-to-many, explicit join model.
      toMany("Post", "tags", "PostTag"),
    ],
    uniqueFields: [["authorId", "slug"]],
  },
  {
    name: "Comment",
    dbName: "comments",
    fields: [
      id(),
      scalar("body", "String", { nativeType: ["Text", []] }),
      scalar("createdAt", "DateTime", {
        hasDefaultValue: true,
        default: { name: "now", args: [] },
      }),
      fk("postId"),
      fk("authorId"),
      toOne("Comment", "post", "Post", "postId"),
      toOne("Comment", "author", "User", "authorId"),
    ],
    uniqueFields: [],
  },
  {
    name: "Category",
    dbName: "categories",
    fields: [
      id(),
      scalar("name", "String", { isUnique: true, nativeType: ["VarChar", ["80"]] }),
      scalar("description", "String", { isRequired: false, nativeType: ["Text", []] }),
      toMany("Category", "posts", "Post"),
    ],
    uniqueFields: [],
  },
  {
    name: "Tag",
    dbName: "tags",
    fields: [
      id(),
      scalar("label", "String", { isUnique: true, nativeType: ["VarChar", ["60"]] }),
      toMany("Tag", "posts", "PostTag"),
    ],
    uniqueFields: [],
  },
  {
    // The join model of the many-to-many.
    name: "PostTag",
    dbName: "post_tags",
    fields: [
      id(),
      fk("postId"),
      fk("tagId"),
      toOne("PostTag", "post", "Post", "postId"),
      toOne("PostTag", "tag", "Tag", "tagId"),
    ],
    uniqueFields: [["postId", "tagId"]],
  },
  {
    name: "Country",
    dbName: "countries",
    fields: [
      id(),
      scalar("name", "String", { isUnique: true, nativeType: ["VarChar", ["100"]] }),
      scalar("isoCode", "String", { isUnique: true, nativeType: ["Char", ["2"]] }),
      toMany("Country", "addresses", "Address"),
    ],
    uniqueFields: [],
  },
  {
    name: "Address",
    dbName: "addresses",
    fields: [
      id(),
      scalar("line1", "String", { nativeType: ["VarChar", ["200"]] }),
      scalar("city", "String", { nativeType: ["VarChar", ["120"]] }),
      fk("countryId"),
      toOne("Address", "country", "Country", "countryId"),
      toMany("Address", "orders", "Order"),
    ],
    uniqueFields: [],
  },
  {
    name: "Product",
    dbName: "products",
    fields: [
      id(),
      scalar("name", "String", { nativeType: ["VarChar", ["150"]] }),
      scalar("sku", "String", { isUnique: true, nativeType: ["VarChar", ["40"]] }),
      scalar("price", "Decimal", { nativeType: ["Decimal", ["10", "2"]] }),
      scalar("weightKg", "Float", { isRequired: false }),
      scalar("stock", "Int", { hasDefaultValue: true, default: 0 }),
      scalar("isPublished", "Boolean", { hasDefaultValue: true, default: false }),
      toMany("Product", "lines", "OrderLine"),
    ],
    uniqueFields: [],
  },
  {
    name: "Order",
    dbName: "orders",
    fields: [
      id(),
      scalar("reference", "String", {
        isUnique: true,
        nativeType: ["VarChar", ["30"]],
      }),
      scalar("total", "Decimal", { nativeType: ["Decimal", ["12", "2"]] }),
      scalar("placedOn", "DateTime", {
        hasDefaultValue: true,
        default: { name: "now", args: [] },
      }),
      enumField("status", "OrderStatus", { hasDefaultValue: true, default: "PENDING" }),
      fk("customerId"),
      fk("shippingAddressId", { isRequired: false }),
      toOne("Order", "customer", "User", "customerId"),
      toOne("Order", "shippingAddress", "Address", "shippingAddressId", {
        isRequired: false,
      }),
      toMany("Order", "lines", "OrderLine"),
    ],
    uniqueFields: [],
  },
  {
    name: "OrderLine",
    dbName: "order_lines",
    fields: [
      id(),
      scalar("quantity", "Int"),
      scalar("unitPrice", "Decimal", { nativeType: ["Decimal", ["10", "2"]] }),
      fk("orderId"),
      fk("productId"),
      toOne("OrderLine", "order", "Order", "orderId"),
      toOne("OrderLine", "product", "Product", "productId"),
    ],
    uniqueFields: [["orderId", "productId"]],
  },
];

export const FIXTURE_DMMF: Dmmf = {
  datamodel: {
    models,
    enums: [
      {
        name: "Role",
        values: [{ name: "ADMIN" }, { name: "EDITOR" }, { name: "VIEWER" }],
      },
      {
        name: "PostStatus",
        values: [{ name: "DRAFT" }, { name: "REVIEW" }, { name: "PUBLISHED" }],
      },
      {
        name: "OrderStatus",
        values: [
          { name: "PENDING" },
          { name: "PAID" },
          { name: "SHIPPED" },
          { name: "CANCELLED" },
        ],
      },
    ],
  },
};

export const FIXTURE_MODEL_COUNT = models.length;
