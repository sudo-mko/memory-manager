import { deriveAutoTags } from '@/services/auto-tag';

const BASE = {
  filename: 'IMG_0001.jpg',
  albumName: 'Camera',
  width: 4000,
  height: 3000,
  mediaType: 'photo' as const,
  createdAt: new Date(2024, 6, 12, 10, 0, 0).getTime(),
};

describe('deriveAutoTags', () => {
  it('tags a camera photo', () => {
    const tags = deriveAutoTags(BASE);
    expect(tags).toContain('camera');
    expect(tags).toContain('photo');
    expect(tags).toContain('landscape');
    expect(tags).toContain('high-res');
    expect(tags).toContain('2024');
  });

  it('detects screenshots from the filename', () => {
    const tags = deriveAutoTags({ ...BASE, filename: 'Screenshot_20250612-193045.png', albumName: 'Screenshots' });
    expect(tags).toContain('screenshot');
  });

  it('detects a screenshot from a phone aspect ratio even when renamed', () => {
    const tags = deriveAutoTags({
      ...BASE,
      filename: 'photo-from-chat.png',
      albumName: null,
      width: 1080,
      height: 2340,
    });
    expect(tags).toContain('screenshot');
  });

  it('does not call a normal portrait photo a screenshot', () => {
    const tags = deriveAutoTags({ ...BASE, filename: 'IMG_9.jpg', width: 3000, height: 4000 });
    expect(tags).not.toContain('screenshot');
    expect(tags).toContain('portrait');
  });

  it('recognises messaging app filenames', () => {
    const tags = deriveAutoTags({ ...BASE, filename: 'IMG-20250115-WA0031.jpg', albumName: 'WhatsApp Images' });
    expect(tags).toContain('whatsapp');
    expect(tags).toContain('received');
  });

  it('recognises documents and receipts', () => {
    const tags = deriveAutoTags({ ...BASE, filename: 'receipt_grocery_march.jpg', albumName: 'Documents' });
    expect(tags).toContain('receipt');
    expect(tags).toContain('document');
  });

  it('tags wide extremes as panoramas', () => {
    const tags = deriveAutoTags({ ...BASE, width: 4000, height: 1000 });
    expect(tags).toContain('panorama');
  });

  it('does not call a tall phone screenshot a panorama', () => {
    const tags = deriveAutoTags({ ...BASE, filename: 'Screenshot_1.png', width: 1080, height: 2160 });
    expect(tags).not.toContain('panorama');
    expect(tags).toContain('tall');
  });

  it('tags squares within tolerance', () => {
    expect(deriveAutoTags({ ...BASE, width: 1000, height: 1000 })).toContain('square');
  });

  it('adds time-of-day and weekend tags', () => {
    const saturdayNight = new Date(2025, 1, 22, 23, 30, 0).getTime();
    const tags = deriveAutoTags({ ...BASE, createdAt: saturdayNight });
    expect(tags).toContain('night');
    expect(tags).toContain('weekend');
  });

  it('marks videos', () => {
    const tags = deriveAutoTags({ ...BASE, filename: 'VID_1.mp4', mediaType: 'video', width: 1080, height: 1920 });
    expect(tags).toContain('video');
    expect(tags).toContain('vertical-video');
  });

  it('flags heavy and tiny files', () => {
    expect(deriveAutoTags({ ...BASE, fileSize: 20 * 1024 * 1024 })).toContain('heavy');
    expect(deriveAutoTags({ ...BASE, fileSize: 4 * 1024 })).toContain('tiny');
  });

  it('never emits a comma, which is the storage delimiter', () => {
    const tags = deriveAutoTags({ ...BASE, filename: 'a,b,c.jpg' });
    expect(tags.every((tag) => !tag.includes(','))).toBe(true);
  });

  it('returns a sorted, deduplicated list', () => {
    const tags = deriveAutoTags({ ...BASE, filename: 'Screenshot_screenshot.png', albumName: 'Screenshots' });
    expect(tags).toEqual([...new Set(tags)].sort());
  });

  it('survives missing dimensions', () => {
    expect(() => deriveAutoTags({ ...BASE, width: 0, height: 0, createdAt: 0 })).not.toThrow();
  });
});
