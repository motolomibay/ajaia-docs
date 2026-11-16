import { describe, it, expect } from 'vitest';
import { setup } from './helpers.js';

const upload = (agent, name, content) => agent.post('/api/documents/import')
  .attach('file', Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'), name);

describe('Lap 4: upload .txt / .md', () => {
  it('L4-A1 markdown keeps headings, emphasis and lists', async () => {
    const { as } = setup();
    const alice = await as('alice');
    const md = '# Title\n\n## Sub\n\nSome **bold** and *italic*.\n\n- one\n- two\n\n1. first\n2. second\n';
    const { id, title } = (await upload(alice, 'Meeting notes.md', md).expect(201)).body;
    expect(title).toBe('Meeting notes');
    const html = (await alice.get(`/api/documents/${id}`)).body.content_html;
    for (const tag of ['<h1>Title</h1>', '<h2>Sub</h2>', '<strong>bold</strong>', '<em>italic</em>', '<ul>', '<ol>', '<li>one</li>']) {
      expect(html).toContain(tag);
    }
  });

  it('L4-A2 text: blank lines → paragraphs, < and & are escaped not interpreted', async () => {
    const { as } = setup();
    const alice = await as('alice');
    const { id } = (await upload(alice, 'notes.txt', 'Line 1\nLine 2\n\na < b & <script>alert(1)</script>').expect(201)).body;
    const html = (await alice.get(`/api/documents/${id}`)).body.content_html;
    expect(html).toBe('<p>Line 1<br />Line 2</p><p>a &lt; b &amp; &lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  it('L4-A3 title is the filename without extension, max 200 chars', async () => {
    const { as } = setup();
    const alice = await as('alice');
    expect((await upload(alice, `${'x'.repeat(250)}.txt`, 'hi').expect(201)).body.title).toHaveLength(200);
    expect((await upload(alice, 'UPPER.MD', '# hi').expect(201)).body.title).toBe('UPPER');
    expect((await upload(alice, 'Résumé 计划 🚀.txt', 'hi').expect(201)).body.title).toBe('Résumé 计划 🚀');
  });

  it('L4-A4 unsupported types are 415', async () => {
    const { as } = setup();
    const alice = await as('alice');
    for (const name of ['report.pdf', 'pic.png', 'README', 'notes.md.exe', 'doc.docx']) {
      const res = await upload(alice, name, 'hello').expect(415);
      expect(res.body.error).toBe('Only .txt and .md files are supported');
    }
  });

  it('L4-A5 too large is 413; empty file and missing file are 400', async () => {
    const { as } = setup();
    const alice = await as('alice');
    const res = await upload(alice, 'big.txt', Buffer.alloc(1024 * 1024 + 1, 'a')).expect(413);
    expect(res.body.error).toBe('File must be 1 MB or smaller');
    await upload(alice, 'exact.txt', Buffer.alloc(1024 * 1024, 'a')).expect(201); // the limit itself is allowed
    await upload(alice, 'empty.txt', Buffer.alloc(0)).expect(400);
    await alice.post('/api/documents/import').field('x', 'y').expect(400);
    await alice.post('/api/documents/import').attach('other', Buffer.from('hi'), 'a.txt').expect(400);
  });

  it('L4-A6 malicious markdown is sanitized', async () => {
    const { as } = setup();
    const alice = await as('alice');
    const md = '# Hi\n\n<script>alert(1)</script>\n\n[click](javascript:alert(1))\n\n<img src=x onerror=alert(1)>\n\n![pic](http://x/y.png)';
    const { id } = (await upload(alice, 'evil.md', md).expect(201)).body;
    const html = (await alice.get(`/api/documents/${id}`)).body.content_html;
    for (const bad of ['<script', 'javascript:', '<img', 'onerror', '<a ']) expect(html).not.toContain(bad);
    expect(html).toContain('click');
  });

  it('L4-A7 uploaded doc is owned by the uploader and private until shared', async () => {
    const { as } = setup();
    const alice = await as('alice');
    const bob = await as('bob');
    const { id } = (await upload(alice, 'mine.md', '# mine').expect(201)).body;
    expect((await alice.get(`/api/documents/${id}`)).body.role).toBe('owner');
    await bob.get(`/api/documents/${id}`).expect(403);
  });

  it('L4-A8 binary or non-UTF-8 content is rejected with 400, never 500', async () => {
    const { as } = setup();
    const alice = await as('alice');
    await upload(alice, 'bin.txt', Buffer.from([0xff, 0xfe, 0x00, 0x81, 0x00])).expect(400);
    await upload(alice, 'nul.txt', Buffer.from('ab\u0000cd')).expect(400);
  });

  it('upload requires login', async () => {
    const { anon } = setup();
    await anon().post('/api/documents/import').attach('file', Buffer.from('hi'), 'a.txt').expect(401);
  });
});
