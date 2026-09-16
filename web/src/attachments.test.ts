import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attachmentMarkdown,
  attachmentReferences,
  deleteAttachment,
  emptyAttachmentTrash,
  formatFileSize,
  imageFiles,
  insertTextAtSelection,
  listAttachments,
  renameAttachment,
  restoreAttachment,
  trashAttachment,
  uploadAttachment,
  uploadAttachments,
} from "./attachments";

function image(name = "photo.png"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("imageFiles", () => {
  it("keeps only image files and tolerates missing payloads", () => {
    const files = [
      image("a.png"),
      new File(["notes"], "notes.txt", { type: "text/plain" }),
    ];
    expect(imageFiles(files).map((file) => file.name)).toEqual(["a.png"]);
    expect(imageFiles(null)).toEqual([]);
    expect(imageFiles(undefined)).toEqual([]);
  });
});

describe("attachmentMarkdown", () => {
  it("removes the extension and strips unsafe alt characters", () => {
    expect(
      attachmentMarkdown({
        filename: "Mi foto.png",
        url: "/api/v1/attachments/x/x.png",
      }),
    ).toBe("![Mi foto](/api/v1/attachments/x/x.png)");
    expect(
      attachmentMarkdown({
        filename: "a[b]\nc.jpg",
        url: "/api/v1/attachments/y/y.jpg",
      }),
    ).toBe("![a b c](/api/v1/attachments/y/y.jpg)");
    expect(
      attachmentMarkdown({ filename: ".png", url: "/api/v1/x" }),
    ).toContain("![imagen]");
  });
});

describe("insertTextAtSelection", () => {
  it("inserts at the caret and clamps out-of-range selections", () => {
    expect(insertTextAtSelection("hello", 2, 2, "X")).toEqual({
      value: "heXllo",
      cursor: 3,
    });
    expect(insertTextAtSelection("hello", 1, 4, "Y")).toEqual({
      value: "hYo",
      cursor: 2,
    });
    expect(insertTextAtSelection("hi", 99, 200, "!")).toEqual({
      value: "hi!",
      cursor: 3,
    });
  });
});

describe("uploadAttachment", () => {
  it("posts multipart form data and returns stored metadata", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          id: "abc",
          filename: "photo.png",
          content_type: "image/png",
          size: 3,
          url: "/api/v1/attachments/abc/abc.png",
          created_at: "2026-09-16T00:00:00Z",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    });
    const result = await uploadAttachment(image());
    expect(calls[0]?.url).toBe("/api/v1/attachments");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.credentials).toBe("include");
    expect(calls[0]?.init.body).toBeInstanceOf(FormData);
    expect(result.url).toBe("/api/v1/attachments/abc/abc.png");
  });

  it("surfaces API failures with their message", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({ error: "Only image attachments are supported" }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
    );
    await expect(uploadAttachment(image())).rejects.toThrow(
      "Only image attachments are supported",
    );
  });
});

describe("uploadAttachments", () => {
  it("uploads in order and joins Markdown embeds", async () => {
    const upload = vi.fn(async (file: File) => ({
      id: file.name,
      filename: file.name,
      content_type: "image/png",
      size: 3,
      url: `/api/v1/attachments/${file.name}/${file.name}`,
      created_at: "2026-09-16T00:00:00Z",
    }));
    const markdown = await uploadAttachments(
      [image("one.png"), image("two.png")],
      upload,
    );
    expect(markdown).toBe(
      "![one](/api/v1/attachments/one.png/one.png)\n![two](/api/v1/attachments/two.png/two.png)",
    );
    expect(upload).toHaveBeenCalledTimes(2);
  });
});

describe("attachmentReferences", () => {
  const url = "/api/v1/attachments/a/a.png";
  const note = (content: string, nodes: { url?: string }[] = []) => ({
    content,
    nodes,
  });

  it("counts notes whose Markdown or canvas cards embed the URL", () => {
    expect(attachmentReferences([], url)).toBe(0);
    expect(
      attachmentReferences(
        [
          note(`texto ![foto](${url})`),
          note("sin adjuntos"),
          note("", [{ url }]),
          note("", [{ url: "https://example.com/other.png" }]),
        ],
        url,
      ),
    ).toBe(2);
  });
});

describe("formatFileSize", () => {
  it("scales bytes, kilobytes and megabytes", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});

describe("attachment library API", () => {
  function stub(makeResponse: () => Response) {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return makeResponse();
    });
    return calls;
  }

  it("lists active attachments or the trash", async () => {
    const calls = stub(() => new Response("[]", { status: 200 }));
    await listAttachments();
    await listAttachments(true);
    expect(calls.map((call) => call.url)).toEqual([
      "/api/v1/attachments",
      "/api/v1/attachments?deleted=true",
    ]);
  });

  it("renames with a PUT body and trashes with a DELETE", async () => {
    const calls = stub(() => new Response("{}", { status: 200 }));
    await renameAttachment("abc", "nuevo.png");
    expect(calls[0]?.url).toBe("/api/v1/attachments/abc");
    expect(calls[0]?.init.method).toBe("PUT");
    expect(calls[0]?.init.body).toBe(JSON.stringify({ filename: "nuevo.png" }));
  });

  it("restores, permanently deletes and empties the trash", async () => {
    const calls = stub(() => new Response(null, { status: 204 }));
    await restoreAttachment("abc");
    await deleteAttachment("abc");
    await emptyAttachmentTrash();
    expect(calls.map((call) => `${call.init.method} ${call.url}`)).toEqual([
      "POST /api/v1/attachments/abc/restore",
      "DELETE /api/v1/attachments/abc/permanent",
      "DELETE /api/v1/attachments/trash",
    ]);
    await trashAttachment("abc");
    expect(calls[3]?.init.method).toBe("DELETE");
    expect(calls[3]?.url).toBe("/api/v1/attachments/abc");
  });
});
