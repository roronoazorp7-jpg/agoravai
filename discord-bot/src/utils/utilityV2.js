import {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';

export function buildUtilityV2({ text, thumbnailUrl = null, imageUrl = null }) {
  const container = new ContainerBuilder();

  if (thumbnailUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl)),
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  }

  if (imageUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl)),
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}