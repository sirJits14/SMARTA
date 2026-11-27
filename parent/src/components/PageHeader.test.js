import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PageHeader from './PageHeader.jsx';

const render = (props) => renderToStaticMarkup(createElement(PageHeader, { title: 'Ana Zamora', avatarName: 'ZAMORA, ANA', ...props }));

describe('PageHeader avatar', () => {
  it('shows initials without a photo', () => {
    expect(render()).not.toContain('<img');
    expect(render({ avatarSrc: '' })).not.toContain('<img');
    expect(render()).toContain('page-header-avatar');
  });
  it('shows the photo in both the large and the compact title', () => {
    const html = render({ avatarSrc: 'data:image/jpeg;base64,abc' });
    const images = html.match(/<img[^>]*>/g);
    expect(images).toHaveLength(2);
    for (const image of images) {
      expect(image).toContain('src="data:image/jpeg;base64,abc"');
      expect(image).toContain('alt=""');
      expect(image).toContain('page-header-avatar');
    }
    expect(images.filter((image) => image.includes('page-header-avatar--small'))).toHaveLength(1);
    expect(html).not.toContain('<span class="page-header-avatar');
  });
});
