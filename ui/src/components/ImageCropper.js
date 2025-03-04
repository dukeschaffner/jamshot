'use client';
import { useState, useRef, useEffect } from 'react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { FaTimes, FaCheck } from 'react-icons/fa';

export default function ImageCropper({ image, onSave, onCancel }) {
  const [crop, setCrop] = useState({
    unit: '%',
    width: 90,
    aspect: 1,
    x: 5,
    y: 5
  });
  const [completedCrop, setCompletedCrop] = useState(null);
  const imgRef = useRef(null);
  const previewCanvasRef = useRef(null);

  useEffect(() => {
    if (!completedCrop || !previewCanvasRef.current || !imgRef.current) return;

    const image = imgRef.current;
    const canvas = previewCanvasRef.current;
    const crop = completedCrop;

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const ctx = canvas.getContext('2d');

    canvas.width = crop.width;
    canvas.height = crop.height;

    ctx.drawImage(
      image,
      crop.x * scaleX,
      crop.y * scaleY,
      crop.width * scaleX,
      crop.height * scaleY,
      0,
      0,
      crop.width,
      crop.height
    );
  }, [completedCrop]);

  const handleSave = () => {
    if (!previewCanvasRef.current) return;

    const position = {
      x: crop.x / 100,
      y: crop.y / 100
    };

    const croppedImageUrl = previewCanvasRef.current.toDataURL('image/jpeg');
    onSave(croppedImageUrl, JSON.stringify(position));
  };

  return (
    <div className="image-cropper-modal">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Adjust Profile Photo</h2>
          <button onClick={onCancel} className="close-btn">
            <FaTimes />
          </button>
        </div>

        <div className="crop-container">
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={1}
            circularCrop
          >
            <img
              ref={imgRef}
              src={image}
              style={{ maxHeight: '70vh' }}
              alt="Crop me"
            />
          </ReactCrop>
        </div>

        <canvas
          ref={previewCanvasRef}
          style={{
            display: 'none',
            width: completedCrop?.width ?? 0,
            height: completedCrop?.height ?? 0
          }}
        />

        <div className="modal-footer">
          <button onClick={onCancel} className="cancel-btn">
            <FaTimes /> Cancel
          </button>
          <button onClick={handleSave} className="save-btn">
            <FaCheck /> Save
          </button>
        </div>
      </div>
    </div>
  );
} 